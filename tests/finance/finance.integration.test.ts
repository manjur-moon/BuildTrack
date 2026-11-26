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
    await expect(write(manager,{action:"post",projectId,expenseId:e.id})).rejects.toMatchObject({status:404});
    const postKey=randomUUID();await write(owner,{action:"post",projectId,expenseId:e.id},postKey);
    await write(owner,{action:"post",projectId,expenseId:e.id},postKey);
    const posted=await service.listFinance(owner,projectId,1);expect(posted.summary.actual).toBe("150.25");expect(posted.summary.overrun).not.toBe("0.00");
    await write(owner,{action:"void",projectId,expenseId:e.id,reason:"Duplicate invoice corrected"});
    const final=await service.listFinance(owner,projectId,1);expect(final.summary.actual).toBe("0.00");expect(final.expenses[0].status).toBe("VOIDED");expect(final.revisions).toHaveLength(1);
  },60000);
});
