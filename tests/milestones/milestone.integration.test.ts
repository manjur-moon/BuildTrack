import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled=process.env.RUN_MILESTONE_INTEGRATION==="1";
if(enabled){
  const u=new URL(process.env.DATABASE_URL??"");
  if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe milestones test database");
  if(config({path:".env",override:false}).error)throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13C.3 isolated milestone lifecycle",()=>{
  let db:typeof import("@/server/db/client")["prisma"];
  let service:typeof import("@/server/milestones/service");
  let owner:AuthorizationContext,manager:AuthorizationContext,foreign:AuthorizationContext,projectId:string;
  beforeAll(async()=>{
    ({prisma:db}=await import("@/server/db/client"));service=await import("@/server/milestones/service");
    const suffix=randomUUID().slice(0,8);
    await db.$transaction(async tx=>{
      const a=await tx.organization.create({data:{name:"Milestone test",slug:`milestones-${suffix}`}});
      const b=await tx.organization.create({data:{name:"Other milestones test",slug:`milestones-other-${suffix}`}});
      async function member(organizationId:string,name:string,role:string){
        const user=await tx.user.create({data:{name,email:`milestones-${name}-${suffix}@example.test`,emailVerified:true}});
        return tx.member.create({data:{organizationId,userId:user.id,role}});
      }
      const o=await member(a.id,"owner","owner"),m=await member(a.id,"manager","member"),f=await member(b.id,"foreign","owner");
      const p=await tx.project.create({data:{organizationId:a.id,name:"Milestone project",code:`FIN-${suffix}`,location:"Dhaka",startDate:new Date("2026-01-01"),expectedEndDate:new Date("2027-01-01")}});
      projectId=p.id;
      await tx.projectMember.create({data:{organizationId:a.id,projectId,membershipId:m.id}});
      await tx.operationalRoleAssignment.create({data:{organizationId:a.id,projectId,membershipId:m.id,grantedByMembershipId:o.id,role:"PROJECT_MANAGER",scope:"PROJECT"}});
      owner={organizationId:a.id,membershipId:o.id,membershipActive:true,emailVerified:true,betterAuthRole:"owner",grants:[]};
      manager={...owner,membershipId:m.id,betterAuthRole:"member",grants:[{role:"PROJECT_MANAGER",scope:"project",organizationId:a.id,projectId}]};
      foreign={...owner,organizationId:b.id,membershipId:f.id};
    });
  },60000);
  afterAll(async()=>{if(db)await db.$disconnect();});
  it("checks scope, replay, optimistic concurrency and terminal state",async()=>{
    const write=(actor:AuthorizationContext,input:Parameters<typeof service.mutateMilestone>[1],key:string=randomUUID())=>service.mutateMilestone(actor,input,key,randomUUID());
    const input={action:"create" as const,projectId,title:"Foundation complete",dueDate:"2026-12-01"};
    const key=randomUUID();const created=await write(manager,input,key);
    expect((await write(manager,input,key)).id).toBe(created.id);
    await expect(write(owner,input,key)).rejects.toMatchObject({status:409});
    await expect(write(foreign,input)).rejects.toMatchObject({status:404});
    await expect(service.listMilestones(foreign,{projectId,page:"1",q:""})).rejects.toMatchObject({status:404});
    await expect(write(manager,{...input,dueDate:"2028-01-01"})).rejects.toMatchObject({status:409});
    const row=(await service.listMilestones(manager,{projectId,page:"1",q:""})).items[0];
    const transition={action:"transition" as const,projectId,milestoneId:row.id,expectedUpdatedAt:row.updatedAt,status:"ACHIEVED" as const,reason:"Verified deliverable"};
    const results=await Promise.allSettled([write(manager,transition),write(manager,transition)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const final=(await service.listMilestones(owner,{projectId,page:"1",q:""})).items[0];
    expect(final.status).toBe("ACHIEVED");expect(final.achievedAt).not.toBeNull();
    await expect(write(owner,{...transition,expectedUpdatedAt:final.updatedAt,status:"CANCELLED"})).rejects.toMatchObject({status:409});
    const revoked = await db.operationalRoleAssignment.updateMany({
      where: { membershipId: manager.membershipId, organizationId: manager.organizationId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByMembershipId: owner.membershipId },
    });
    expect(revoked.count).toBe(1);
    await expect(write(manager,input,key)).rejects.toMatchObject({status:403});
  },60000);
});
