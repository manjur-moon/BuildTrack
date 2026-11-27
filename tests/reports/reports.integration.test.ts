import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled=process.env.RUN_REPORTS_INTEGRATION==="1";
if(enabled){
  const u=new URL(process.env.DATABASE_URL??"");
  if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe reports test database");
  if(config({path:".env",override:false}).error)throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13D.4 reports SQL scopes",()=>{
  let db:typeof import("@/server/db/client")["prisma"];
  let reports:typeof import("@/server/reports/service");
  let projectId:string, otherProjectId:string;
  let owner:AuthorizationContext, manager:AuthorizationContext, engineer:AuthorizationContext, finance:AuthorizationContext, contractor:AuthorizationContext, foreign:AuthorizationContext;
  const now=new Date("2026-11-27T12:00:00Z");
  beforeAll(async()=>{
    ({prisma:db}=await import("@/server/db/client"));reports=await import("@/server/reports/service");
    const suffix=randomUUID().slice(0,12);
    await db.$transaction(async tx=>{
      const a=await tx.organization.create({data:{name:"Analytics test",slug:`analytics-${suffix}`}});
      const b=await tx.organization.create({data:{name:"Foreign analytics",slug:`analytics-other-${suffix}`}});
      const member=async(organizationId:string,name:string,role:string)=>{
        const user=await tx.user.create({data:{name,email:`analytics-${name}-${suffix}@example.test`,emailVerified:true}});
        return tx.member.create({data:{organizationId,userId:user.id,role}});
      };
      const o=await member(a.id,"owner","owner"), m=await member(a.id,"manager","member"), e=await member(a.id,"engineer","member"), f=await member(a.id,"finance","member"), c=await member(a.id,"contractor","member"), x=await member(b.id,"foreign","owner");
      const organizationId=a.id;
      const p=await tx.project.create({data:{organizationId,name:"Assigned project",code:"A",location:"Dhaka",startDate:new Date("2026-01-01"),expectedEndDate:new Date("2026-12-31"),status:"ACTIVE"}});
      const q=await tx.project.create({data:{organizationId,name:"Unassigned project",code:"B",location:"Dhaka",startDate:new Date("2026-01-01"),expectedEndDate:new Date("2026-10-31"),status:"ACTIVE"}});
      projectId=p.id;otherProjectId=q.id;
      const s=await tx.constructionSite.create({data:{organizationId,projectId:p.id,name:"Assigned site",location:"Dhaka",status:"ACTIVE"}});
      const s2=await tx.constructionSite.create({data:{organizationId,projectId:p.id,name:"Other site",location:"Dhaka",status:"ACTIVE"}});
      for(const who of [m,e,c])await tx.projectMember.create({data:{organizationId,projectId:p.id,membershipId:who.id}});
      await tx.siteAssignment.create({data:{organizationId,projectId:p.id,siteId:s.id,membershipId:e.id}});
      const co=await tx.contractorCompany.create({data:{organizationId,name:"Contractor test company"}});
      await tx.contractorUser.create({data:{organizationId,contractorId:co.id,membershipId:c.id}});
      await tx.projectContractorAssignment.create({data:{organizationId,projectId:p.id,contractorId:co.id,assignedByMembershipId:o.id}});
      await tx.operationalRoleAssignment.create({data:{organizationId,projectId:p.id,membershipId:m.id,grantedByMembershipId:o.id,role:"PROJECT_MANAGER",scope:"PROJECT"}});
      await tx.operationalRoleAssignment.create({data:{organizationId,projectId:p.id,siteId:s.id,membershipId:e.id,grantedByMembershipId:o.id,role:"SITE_ENGINEER",scope:"SITE"}});
      await tx.operationalRoleAssignment.create({data:{organizationId,membershipId:f.id,grantedByMembershipId:o.id,role:"FINANCE_MANAGER",scope:"ORGANIZATION"}});
      await tx.operationalRoleAssignment.create({data:{organizationId,projectId:p.id,membershipId:c.id,grantedByMembershipId:o.id,role:"CONTRACTOR",scope:"PROJECT"}});
      const task=await tx.task.create({data:{organizationId,projectId:p.id,siteId:s.id,title:"Assigned task",dueOn:new Date("2026-12-01"),createdByMembershipId:o.id,status:"IN_PROGRESS",progressPercent:"50"}});
      await tx.taskAssignment.create({data:{organizationId,projectId:p.id,taskId:task.id,membershipId:c.id}});
      await tx.task.create({data:{organizationId,projectId:p.id,siteId:s2.id,title:"Other task",dueOn:new Date("2026-11-01"),createdByMembershipId:o.id}});
      await tx.task.create({data:{organizationId,projectId:q.id,title:"Other project task",dueOn:new Date("2026-11-01"),createdByMembershipId:o.id}});
      const category=await tx.expenseCategory.create({data:{organizationId,name:"Analytics costs"}});
      for(const projectId of [p.id,q.id])await tx.projectBudget.create({data:{organizationId,projectId,initialAmount:"100",approvedAmount:"100",currency:"BDT"}});
      await tx.expense.create({data:{organizationId,projectId:p.id,categoryId:category.id,title:"Posted A",amount:"125.25",expenseDate:new Date("2026-11-01"),recordedByMembershipId:o.id,status:"POSTED",postedAt:now}});
      await tx.expense.create({data:{organizationId,projectId:q.id,categoryId:category.id,title:"Posted B",amount:"20",expenseDate:new Date("2026-10-01"),recordedByMembershipId:o.id,status:"POSTED",postedAt:now}});
      await tx.expense.create({data:{organizationId,projectId:p.id,categoryId:category.id,title:"Draft excluded",amount:"900",expenseDate:new Date("2026-11-01"),recordedByMembershipId:o.id}});
      await tx.expense.create({data:{organizationId,projectId:p.id,categoryId:category.id,title:"Voided excluded",amount:"700",expenseDate:new Date("2026-11-01"),recordedByMembershipId:o.id,status:"VOIDED",postedAt:now,voidedAt:now,voidedByMembershipId:o.id,voidReason:"Correction"}});
      owner={organizationId,membershipId:o.id,membershipActive:true,emailVerified:true,betterAuthRole:"owner",grants:[]};
      manager={...owner,betterAuthRole:"member",membershipId:m.id,grants:[{organizationId,role:"PROJECT_MANAGER",scope:"project",projectId:p.id}]};
      engineer={...owner,betterAuthRole:"member",membershipId:e.id,grants:[{organizationId,role:"SITE_ENGINEER",scope:"site",projectId:p.id,siteId:s.id}]};
      finance={...owner,betterAuthRole:"member",membershipId:f.id,grants:[{organizationId,role:"FINANCE_MANAGER",scope:"organization"}]};
      contractor={...owner,betterAuthRole:"member",membershipId:c.id,grants:[{organizationId,role:"CONTRACTOR",scope:"project",projectId:p.id}]};
      foreign={...owner,organizationId:b.id,membershipId:x.id};
    });
  },60000);
  afterAll(async()=>{if(db)await db.$disconnect();});
  it("returns exact posted financials and rejects unauthorized project access",async()=>{
    const result=await reports.projectReport(manager,"finance",projectId,1,now);
    expect(result?.kind).toBe("finance");if(result?.kind!=="finance")throw Error("Missing financial report");
    expect(result.totals).toMatchObject({approved:"100.00",actual:"125.25",remaining:"-25.25",overrun:"25.25"});
    expect(result.total).toBe(1);expect(result.trend.at(-1)?.amount).toBe("125.25");
    expect(await reports.projectReport(manager,"finance",otherProjectId,1,now)).toBeNull();
    expect(await reports.projectReport(foreign,"finance",projectId,1,now)).toBeNull();
    expect(await reports.projectReport(engineer,"finance",projectId,1,now)).toBeNull();
    expect(await reports.projectReport(contractor,"finance",projectId,1,now)).toBeNull();
    expect((await reports.reportProjects(finance,"finance","",1))?.total).toBe(2);
    expect((await reports.reportProjects(owner,"finance","",1))?.total).toBe(2);
  },60000);
  it("limits project schedules and counts real contractor task outcomes",async()=>{
    const timeline=await reports.projectReport(manager,"timeline",projectId,1,now);
    expect(timeline?.kind).toBe("timeline");if(timeline?.kind!=="timeline")throw Error("Missing timeline");
    expect(timeline.progress).toBe("25.00");expect(timeline.total).toBe(2);
    const c=await reports.projectReport(manager,"contractors",projectId,1,now);
    expect(c?.kind).toBe("contractors");if(c?.kind!=="contractors")throw Error("Missing contractor outcomes");
    expect(c.items).toHaveLength(1);expect(c.items[0]).toMatchObject({assigned:1,completed:0,overdue:0,completion:"0.0"});
    expect(await reports.projectReport(manager,"timeline",otherProjectId,1,now)).toBeNull();
    expect(await reports.projectReport(finance,"timeline",projectId,1,now)).toBeNull();
    expect(await reports.projectReport(contractor,"contractors",projectId,1,now)).toBeNull();
    expect(await reports.projectReport(foreign,"contractors",projectId,1,now)).toBeNull();
  },60000);
});
