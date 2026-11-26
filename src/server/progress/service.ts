import { prisma } from "@/server/db/client";
import { hasPermission,type AuthorizationContext } from "@/server/rbac/policy";
import { requireLiveProjectLock,lockSiteRow } from "@/server/construction/locking";
import { audit,inventoryWrite,type Tx } from "@/server/inventory/transaction";
import { dhakaDate } from "@/server/milestones/rules";
import { reportAccess,missing,conflict } from "./access";
import type { ReportInput,ReportQuery } from "./input";
const ymd=(d:Date)=>d.toISOString().slice(0,10);
export async function listReports(actor:AuthorizationContext,query:ReportQuery){
  return prisma.$transaction(async tx=>{
    const access=await reportAccess(tx,actor,query.projectId,query.siteId,query.taskId,false);
    const where={organizationId:actor.organizationId,projectId:query.projectId,siteId:query.siteId,...(query.taskId?{taskId:query.taskId}:{}),...(access.restricted?{reportedByMembershipId:actor.membershipId}:{}),...(query.q?{workDescription:{contains:query.q,mode:"insensitive" as const}}:{}),...(query.from||query.to?{workDate:{...(query.from?{gte:new Date(query.from)}:{}),...(query.to?{lte:new Date(query.to)}:{})}}:{})};
    const page=Number(query.page);
    const rows=await tx.dailyProgressReport.findMany({where,orderBy:[{workDate:"desc"},{id:"desc"}],skip:(page-1)*20,take:20,include:{task:{select:{title:true}},reportedBy:{select:{user:{select:{name:true}}}},attachments:{where:{status:"READY",deletedAt:null},select:{id:true,originalName:true}}}});
    const total=await tx.dailyProgressReport.count({where});
    const scope={organizationId:actor.organizationId,projectId:query.projectId,siteId:query.siteId};
    return {page,total,canSubmit:access.restricted||hasPermission(actor,"site:update",scope),items:rows.map(r=>({id:r.id,workDate:ymd(r.workDate),workDescription:r.workDescription,delayReason:r.delayReason,observedProgress:r.observedProgress?.toString()??null,taskTitle:r.task?.title??null,reporter:r.reportedBy.user.name,submittedAt:r.submittedAt.toISOString(),photos:r.attachments.map(a=>({id:a.id,name:a.originalName,contentUrl:`/api/v1/media/${encodeURIComponent(a.id)}/content`}))}))};
  });
}
export async function createReport(actor:AuthorizationContext,input:ReportInput,key:string,requestId:string){
  const {organizationId,membershipId}=actor;
  const guard=async(tx:Tx)=>{
    await requireLiveProjectLock(tx,organizationId,input.projectId);
    const site=await lockSiteRow(tx,organizationId,input.projectId,input.siteId);
    if(!site||site.archivedAt)missing();
    return reportAccess(tx,actor,input.projectId,input.siteId,input.taskId,true);
  };
  return inventoryWrite(actor,"progress.create",key,input,async tx=>{await guard(tx);},async tx=>{
    const access=await guard(tx);
    const project=await tx.project.findFirst({where:{id:input.projectId,organizationId},select:{startDate:true,status:true}});
    if(!project)missing();
    if(["COMPLETED","CANCELLED"].includes(project.status)||access.site.status==="CLOSED")conflict("Project or site is closed.");
    if(input.workDate>dhakaDate()||input.workDate<ymd(project.startDate))conflict("Work date must be between project start and today.");
    if(input.observedProgress!==undefined&&!input.taskId)conflict("Select a task for a progress observation.");
    if(access.task?.status==="COMPLETED"&&input.observedProgress!==undefined&&Number(input.observedProgress)!==100)conflict("Completed task observations must be 100%.");
    if(access.restricted&&input.photoIds.length)conflict("Contractor photo upload is not enabled.");
    const report=await tx.dailyProgressReport.create({data:{organizationId,projectId:input.projectId,siteId:input.siteId,taskId:input.taskId,reportedByMembershipId:membershipId,workDate:new Date(input.workDate),workDescription:input.workDescription,delayReason:input.delayReason||null,observedProgress:input.observedProgress},select:{id:true}});
    if(input.photoIds.length){
      // Reparent only the submitter's verified, unlinked site photos. The existing exactly-one-parent constraint remains valid.
      const changed=await tx.fileAttachment.updateMany({where:{id:{in:input.photoIds},organizationId,projectId:input.projectId,siteId:input.siteId,uploadedByMembershipId:membershipId,status:"READY",deletedAt:null,reportId:null,taskId:null,expenseId:null,mimeType:"image/webp"},data:{projectId:null,siteId:null,reportId:report.id}});
      if(changed.count!==input.photoIds.length)conflict("One or more photos are unavailable or outside your site.");
    }
    await audit(tx,actor,requestId,"PROGRESS_REPORT_CREATED","DAILY_PROGRESS_REPORT",report.id,{projectId:input.projectId,siteId:input.siteId,taskId:input.taskId??null,workDate:input.workDate,observedProgress:input.observedProgress??null,photoIds:input.photoIds});
    return report;
  });
}
