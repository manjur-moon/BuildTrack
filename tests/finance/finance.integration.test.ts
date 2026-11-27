import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled=process.env.RUN_FINANCE_INTEGRATION==="1";
if(enabled){
  const u=new URL(process.env.DATABASE_URL??"");
  if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe finance test database");
  if(config({path:".env",override:false}).error)throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13B isolated finance lifecycle",()=>{
  let db:typeof import("@/server/db/client")["prisma"];
  let service:typeof import("@/server/finance/service");
  let owner:AuthorizationContext,manager:AuthorizationContext,foreign:AuthorizationContext,projectId:string;
  beforeAll(async()=>{
    ({prisma:db}=await import("@/server/db/client"));service=await import("@/server/finance/service");
    const suffix=randomUUID().slice(0,8);
    await db.$transaction(async tx=>{
      const a=await tx.organization.create({data:{name:"Finance test",slug:`finance-${suffix}`}});
      const b=await tx.organization.create({data:{name:"Other finance test",slug:`finance-other-${suffix}`}});
      async function member(organizationId:string,name:string,role:string){
        const user=await tx.user.create({data:{name,email:`finance-${name}-${suffix}@example.test`,emailVerified:true}});
        return tx.member.create({data:{organizationId,userId:user.id,role}});
      }
      const o=await member(a.id,"owner","owner"),m=await member(a.id,"manager","member"),f=await member(b.id,"foreign","owner");
      const p=await tx.project.create({data:{organizationId:a.id,name:"Finance project",code:`FIN-${suffix}`,location:"Dhaka",startDate:new Date("2026-01-01"),expectedEndDate:new Date("2027-01-01")}});
      projectId=p.id;
      await tx.projectMember.create({data:{organizationId:a.id,projectId,membershipId:m.id}});
      await tx.operationalRoleAssignment.create({data:{organizationId:a.id,projectId,membershipId:m.id,grantedByMembershipId:o.id,role:"PROJECT_MANAGER",scope:"PROJECT"}});
      owner={organizationId:a.id,membershipId:o.id,membershipActive:true,emailVerified:true,betterAuthRole:"owner",grants:[]};
      manager={...owner,membershipId:m.id,betterAuthRole:"member",grants:[{role:"PROJECT_MANAGER",scope:"project",organizationId:a.id,projectId}]};
      foreign={...owner,organizationId:b.id,membershipId:f.id};
    });
  },60000);
  afterAll(async()=>{if(db)await db.$disconnect();});
  it("keeps budgets, posting, voiding and replay atomic and tenant scoped",async()=>{
    const write=(actor:AuthorizationContext,input:Parameters<typeof service.mutateFinance>[1],key=randomUUID())=>service.mutateFinance(actor,input,key,randomUUID());
    const category=await write(owner,{action:"category",name:"Concrete"});
    await write(owner,{action:"budget",projectId,amount:"100",expected:null,reason:"Initial approved budget"});
    await expect(write(manager,{action:"budget",projectId,amount:"110",expected:"100",reason:"Unauthorized revision"})).rejects.toMatchObject({status:404});
    const revisions=await Promise.allSettled([write(owner,{action:"budget",projectId,amount:"120",expected:"100",reason:"Approved revision A"}),write(owner,{action:"budget",projectId,amount:"130",expected:"100",reason:"Approved revision B"})]);
    expect(revisions.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const draft={action:"draft" as const,projectId,categoryId:category.id,title:"Concrete delivery",amount:"150.25",date:"2026-11-27"};
    const key=randomUUID();const e=await write(manager,draft,key);expect((await write(manager,draft,key)).id).toBe(e.id);
    expect((await service.listFinance(owner,projectId,1)).summary.actual).toBe("0.00");
    await expect(write(owner,{...draft},key)).rejects.toMatchObject({status:409});
    await expect(service.listFinance(foreign,projectId,1)).rejects.toMatchObject({status:404});
    const expectedUpdatedAt=(await db.expense.findUniqueOrThrow({where:{id:e.id}})).updatedAt.toISOString();
    await expect(write(manager,{action:"post",projectId,expenseId:e.id,expectedUpdatedAt})).rejects.toMatchObject({status:404});
    const postKey=randomUUID();await write(owner,{action:"post",projectId,expenseId:e.id,expectedUpdatedAt},postKey);
    await write(owner,{action:"post",projectId,expenseId:e.id,expectedUpdatedAt},postKey);
    const posted=await service.listFinance(owner,projectId,1);expect(posted.summary.actual).toBe("150.25");expect(posted.summary.overrun).not.toBe("0.00");
    await write(owner,{action:"void",projectId,expenseId:e.id,expectedUpdatedAt:posted.expenses[0].updatedAt,reason:"Duplicate invoice corrected"});
    const final=await service.listFinance(owner,projectId,1);expect(final.summary.actual).toBe("0.00");expect(final.expenses[0].status).toBe("VOIDED");expect(final.revisions).toHaveLength(1);
  },60000);
  it("creates an optional initial budget atomically and protects correction chains and stale approvals",async()=>{
    const write=(actor:AuthorizationContext,input:Parameters<typeof service.mutateFinance>[1],key=randomUUID())=>service.mutateFinance(actor,input,key,randomUUID());
    const {createProject}=await import("@/server/construction/projects");
    const initial={name:"Budget at creation",code:`INIT-${randomUUID().slice(0,8)}`,location:"Dhaka",startDate:"2026-01-01",expectedEndDate:"2027-01-01",initialBudget:"1234.56"};
    const projectKey=randomUUID();
    await expect(createProject(manager,initial,randomUUID(),randomUUID())).rejects.toMatchObject({status:403});
    const project=await createProject(owner,initial,randomUUID(),projectKey);
    expect((await createProject(owner,initial,randomUUID(),projectKey)).id).toBe(project.id);
    expect((await db.projectBudget.findFirstOrThrow({where:{organizationId:owner.organizationId,projectId:project.id}})).approvedAmount.toFixed(2)).toBe("1234.56");
    expect(await db.auditEvent.count({where:{organizationId:owner.organizationId,action:"PROJECT_CREATED",resourceId:project.id}})).toBe(1);
    const category=await write(owner,{action:"category",name:`Correction ${randomUUID()}`});
    const draft={action:"draft" as const,projectId,categoryId:category.id,title:"Original delivery",amount:"25.00",date:"2026-11-27"};
    const created=await write(manager,draft);
    const get=()=>db.expense.findUniqueOrThrow({where:{id:created.id}});
    const first=(await get()).updatedAt.toISOString();
    const edit={...draft,action:"edit" as const,expenseId:created.id,expectedUpdatedAt:first,amount:"30.50"};
    await expect(write(owner,edit)).rejects.toMatchObject({status:404});
    await expect(write(foreign,edit)).rejects.toMatchObject({status:404});
    const editKey=randomUUID();await write(manager,edit,editKey);await write(manager,edit,editKey);
    expect((await get()).amount.toFixed(2)).toBe("30.50");
    await expect(write(manager,edit)).rejects.toMatchObject({status:409});
    await expect(write(owner,{action:"post",projectId,expenseId:created.id,expectedUpdatedAt:first})).rejects.toMatchObject({status:409});
    const current=(await get()).updatedAt.toISOString();
    await write(owner,{action:"post",projectId,expenseId:created.id,expectedUpdatedAt:current});
    const posted=await get();
    await expect(write(manager,{...edit,expectedUpdatedAt:posted.updatedAt.toISOString()})).rejects.toMatchObject({status:409});
    const replace={...draft,action:"replace" as const,expenseId:created.id,expectedUpdatedAt:posted.updatedAt.toISOString(),amount:"28.75",reason:"Invoice amount corrected"};
    await expect(write(manager,replace)).rejects.toMatchObject({status:404});
    await expect(write(owner,{...replace,categoryId:"missing"})).rejects.toMatchObject({status:404});
    expect((await get()).status).toBe("POSTED");
    const key=randomUUID();const replacement=await write(owner,replace,key);
    expect((await write(owner,replace,key)).id).toBe(replacement.id);
    expect((await get()).status).toBe("VOIDED");
    const next=await db.expense.findUniqueOrThrow({where:{id:replacement.id}});
    expect(next).toMatchObject({replacementOfId:created.id,status:"DRAFT"});
    expect(next.amount.toFixed(2)).toBe("28.75");
    expect((await service.listFinance(owner,projectId,1)).summary.actual).toBe("0.00");
    await expect(write(owner,{action:"post",projectId,expenseId:next.id,expectedUpdatedAt:next.updatedAt.toISOString()})).rejects.toMatchObject({status:404});
    await expect(write(owner,replace)).rejects.toMatchObject({status:409});
    await expect(db.expense.update({where:{id:next.id},data:{replacementOfId:null}})).rejects.toThrow();
    await expect(db.expense.delete({where:{id:next.id}})).rejects.toThrow();
    expect(await db.expense.count({where:{organizationId:owner.organizationId,projectId,replacementOfId:created.id}})).toBe(1);
    expect(await db.auditEvent.count({where:{organizationId:owner.organizationId,resourceId:replacement.id,action:"EXPENSE_REPLACEMENT_DRAFTED"}})).toBe(1);
    const approver=await db.$transaction(async tx=>{
      const user=await tx.user.create({data:{name:"Independent finance approver",email:`finance-approver-${randomUUID()}@example.test`,emailVerified:true}});
      const member=await tx.member.create({data:{organizationId:owner.organizationId,userId:user.id,role:"member"}});
      await tx.operationalRoleAssignment.create({data:{organizationId:owner.organizationId,membershipId:member.id,grantedByMembershipId:owner.membershipId,role:"FINANCE_MANAGER",scope:"ORGANIZATION"}});
      return {...owner,membershipId:member.id,betterAuthRole:"member",grants:[{role:"FINANCE_MANAGER",scope:"organization",organizationId:owner.organizationId}]} satisfies AuthorizationContext;
    });
    await write(approver,{action:"post",projectId,expenseId:next.id,expectedUpdatedAt:next.updatedAt.toISOString()});
    expect((await service.listFinance(owner,projectId,1)).summary.actual).toBe("28.75");
  },60000);
});
