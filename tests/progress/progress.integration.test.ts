import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {config} from "dotenv";
import type {AuthorizationContext} from "@/server/rbac/policy";
import {dhakaDate} from "@/server/milestones/rules";
const enabled=process.env.RUN_PROGRESS_INTEGRATION==="1";
if(enabled){const u=new URL(process.env.DATABASE_URL??"");if(!["localhost","127.0.0.1"].includes(u.hostname)||u.port!=="5433"||u.pathname!=="/buildtrack_auth_test")throw Error("Unsafe progress test database");if(config({path:".env",override:false}).error)throw Error("Missing .env");}
describe.skipIf(!enabled)("Step 13C.4 isolated daily progress",()=>{
 let db:typeof import("@/server/db/client")["prisma"],service:typeof import("@/server/progress/service");
 let owner:AuthorizationContext,engineer:AuthorizationContext,foreign:AuthorizationContext,projectId:string,siteId:string,otherSite:string,taskId:string,photoId:string;
 beforeAll(async()=>{
  ({prisma:db}=await import("@/server/db/client"));service=await import("@/server/progress/service");const suffix=randomUUID().slice(0,8);
  await db.$transaction(async tx=>{
   const a=await tx.organization.create({data:{name:"Progress test",slug:`progress-${suffix}`}}),b=await tx.organization.create({data:{name:"Other progress",slug:`progress-other-${suffix}`}});
   async function member(organizationId:string,name:string,role:string){const user=await tx.user.create({data:{name,email:`progress-${name}-${suffix}@example.test`,emailVerified:true}});return tx.member.create({data:{organizationId,userId:user.id,role}});}
   const o=await member(a.id,"owner","owner"),e=await member(a.id,"engineer","member"),f=await member(b.id,"foreign","owner");
   const p=await tx.project.create({data:{organizationId:a.id,name:"Progress project",code:`PROG-${suffix}`,location:"Dhaka",startDate:new Date("2020-01-01"),expectedEndDate:new Date("2035-01-01")}});projectId=p.id;
   const s=await tx.constructionSite.create({data:{organizationId:a.id,projectId,name:"Site A",location:"Dhaka"}});siteId=s.id;
   otherSite=(await tx.constructionSite.create({data:{organizationId:a.id,projectId,name:"Site B",location:"Dhaka"}})).id;
   await tx.projectMember.create({data:{organizationId:a.id,projectId,membershipId:e.id}});
   await tx.siteAssignment.create({data:{organizationId:a.id,projectId,siteId,membershipId:e.id}});
   await tx.operationalRoleAssignment.create({data:{organizationId:a.id,projectId,siteId,membershipId:e.id,grantedByMembershipId:o.id,role:"SITE_ENGINEER",scope:"SITE"}});
   taskId=(await tx.task.create({data:{organizationId:a.id,projectId,siteId,title:"Foundation",dueOn:new Date("2030-01-01"),createdByMembershipId:o.id}})).id;
   photoId=(await tx.fileAttachment.create({data:{organizationId:a.id,projectId,siteId,uploadedByMembershipId:e.id,objectKey:`fixture/${randomUUID()}.webp`,originalName:"fixture.webp",mimeType:"image/webp",byteSize:20n,status:"READY"}})).id;
   owner={organizationId:a.id,membershipId:o.id,membershipActive:true,emailVerified:true,betterAuthRole:"owner",grants:[]};engineer={...owner,membershipId:e.id,betterAuthRole:"member",grants:[{role:"SITE_ENGINEER",scope:"site",organizationId:a.id,projectId,siteId}]};foreign={...owner,organizationId:b.id,membershipId:f.id};
  });
 },60000);
 afterAll(async()=>{if(db)await db.$disconnect();});
 it("preserves task authority and evidence, isolates site access and rejects revoked replay",async()=>{
  const input={projectId,siteId,taskId,workDate:dhakaDate(),workDescription:"Foundation work observed",observedProgress:"45.50",photoIds:[photoId]};const key=randomUUID();
  const write=(actor:AuthorizationContext,body:typeof input,k=randomUUID())=>service.createReport(actor,body,k,randomUUID());
  const r=await write(engineer,input,key);expect((await write(engineer,input,key)).id).toBe(r.id);
  const task=await db.task.findUniqueOrThrow({where:{id:taskId}});expect(task.progressPercent.toString()).toBe("0");expect(task.status).toBe("TODO");
  const photo=await db.fileAttachment.findUniqueOrThrow({where:{id:photoId}});expect(photo.reportId).toBe(r.id);expect(photo.projectId).toBeNull();expect(photo.siteId).toBeNull();
  const query={projectId,siteId,page:"1",q:""};const list=await service.listReports(owner,query);expect(list.items[0].photos[0].id).toBe(photoId);
  await expect(service.listReports(foreign,query)).rejects.toMatchObject({status:404});
  await expect(write(engineer,{...input,siteId:otherSite})).rejects.toMatchObject({status:404});
  await expect(write(engineer,input)).rejects.toMatchObject({status:409});expect(await db.dailyProgressReport.count({where:{organizationId:owner.organizationId,siteId}})).toBe(1);
  const revoked=await db.operationalRoleAssignment.updateMany({where:{organizationId:owner.organizationId,membershipId:engineer.membershipId,revokedAt:null},data:{revokedAt:new Date(),revokedByMembershipId:owner.membershipId}});expect(revoked.count).toBe(1);
  await expect(write(engineer,input,key)).rejects.toMatchObject({status:403});
 },60000);
});
