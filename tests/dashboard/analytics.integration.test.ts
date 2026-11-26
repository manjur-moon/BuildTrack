import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled=process.env.RUN_DASHBOARD_INTEGRATION==="1";
if(enabled){
  const u=new URL(process.env.DATABASE_URL??"");
  if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe dashboard test database");
  if(config({path:".env",override:false}).error)throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13D.1 dashboard analytics SQL scopes",()=>{
  let db:typeof import("@/server/db/client")["prisma"];
  let load:typeof import("@/server/dashboard/analytics")["loadDashboardAnalytics"];
  let owner:AuthorizationContext, manager:AuthorizationContext, engineer:AuthorizationContext, finance:AuthorizationContext, contractor:AuthorizationContext, foreign:AuthorizationContext;
  const now=new Date("2026-11-27T12:00:00Z");
  beforeAll(async()=>{
    ({prisma:db}=await import("@/server/db/client"));({loadDashboardAnalytics:load}=await import("@/server/dashboard/analytics"));
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
      await tx.taskDependency.create({data:{organizationId,projectId:p.id,predecessorTaskId:task.id,successorTaskId:(await tx.task.findFirstOrThrow({where:{organizationId,projectId:p.id,siteId:s2.id}})).id}});
      const materialCategory=await tx.materialCategory.create({data:{organizationId,name:"Analytics material"}});
      const material=await tx.material.create({data:{organizationId,categoryId:materialCategory.id,name:"Cement",sku:"ANALYTICS-CEMENT",unit:"BAG"}});
      await tx.siteInventory.create({data:{organizationId,siteId:s.id,materialId:material.id,onHand:"2",reorderLevel:"3"}});
      await tx.siteInventory.create({data:{organizationId,siteId:s2.id,materialId:material.id,onHand:"0",reorderLevel:"0"}});
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
  it("calculates authorized project risk and exact posted financial totals",async()=>{
    const a=await load(owner,now);expect(a.projects).toMatchObject({total:2,active:2,delayed:1,atRisk:1});expect(a.finance).toMatchObject({approved:"200.00",actual:"145.25",overBudget:1});expect(a.finance?.trend.at(-1)?.amount).toBe("125.25");
    const m=await load(manager,now);expect(m.projects?.total).toBe(1);expect(m.projects?.recent[0].progress).toBe(25);expect(m.finance?.actual).toBe("125.25");expect(m.tasks?.open).toBe(2);expect(m.tasks?.blocked).toBe(1);expect(m.inventory).toMatchObject({stockLines:2,lowStock:1});
  },60000);
  it("isolates engineer and contractor, finance, and foreign tenant data",async()=>{
    const e=await load(engineer,now);expect(e.finance).toBeNull();expect(e.projects).toBeNull();expect(e.tasks?.open).toBe(1);expect(e.sites?.total).toBe(1);expect(e.inventory).toMatchObject({stockLines:1,lowStock:1});
    const c=await load(contractor,now);expect(c.projects).toBeNull();expect(c.finance).toBeNull();expect(c.inventory).toBeNull();expect(c.summaryProjects).toBe(1);expect(c.tasks?.open).toBe(1);expect(c.tasks?.upcoming[0].title).toBe("Assigned task");
    const f=await load(finance,now);expect(f.tasks).toBeNull();expect(f.projects).toBeNull();expect(f.finance?.actual).toBe("145.25");
    const x=await load(foreign,now);expect(x.projects?.total).toBe(0);expect(x.finance?.actual).toBe("0.00");
  },60000);
});
