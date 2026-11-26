import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hasPermission,type AuthorizationContext } from "@/server/rbac/policy";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { requireLiveProjectLock } from "@/server/construction/locking";
import { audit,inventoryWrite,type Tx } from "@/server/inventory/transaction";
import type { MilestoneInput,MilestoneQuery } from "./input";
import { canTransition,isOverdue,dhakaDate } from "./rules";
function missing():never {throw new ApiError(404,"NOT_FOUND","Milestone or project not found.");}
function conflict(message:string):never {throw new ApiError(409,"CONFLICT",message);}
const ymd=(d:Date)=>d.toISOString().slice(0,10);
function resource(actor:AuthorizationContext,projectId:string){return {organizationId:actor.organizationId,projectId};}
export async function listMilestones(actor:AuthorizationContext,query:MilestoneQuery){
  const scope=resource(actor,query.projectId);
  return prisma.$transaction(async tx=>{
    await assertCurrentWriteAccess(tx,actor,"project:view",scope);
    const project=await tx.project.findFirst({where:{id:query.projectId,organizationId:actor.organizationId,archivedAt:null},select:{id:true}});
    if(!project)missing();
    const where={organizationId:actor.organizationId,projectId:query.projectId,...(query.status?{status:query.status}:{}),...(query.q?{title:{contains:query.q,mode:"insensitive" as const}}:{})};
    const page=Number(query.page);
    const rows=await tx.milestone.findMany({where,orderBy:[{dueDate:"asc"},{id:"asc"}],skip:(page-1)*20,take:20});
    const total=await tx.milestone.count({where});
    const today=dhakaDate();
    return {items:rows.map(m=>({...m,dueDate:ymd(m.dueDate),updatedAt:m.updatedAt.toISOString(),overdue:isOverdue(m.status,ymd(m.dueDate),today)})),total,page,canEdit:hasPermission(actor,"project:update",scope)};
  });
}
export async function mutateMilestone(actor:AuthorizationContext,input:MilestoneInput,key:string,requestId:string){
  const scope=resource(actor,input.projectId);
  const guard=async(tx:Tx)=>{await requireLiveProjectLock(tx,actor.organizationId,input.projectId);await assertCurrentWriteAccess(tx,actor,"project:update",scope);};
  return inventoryWrite(actor,`milestone.${input.action}`,key,input,guard,async tx=>{
    await guard(tx);
    const where={organizationId:actor.organizationId,projectId:input.projectId};
    const project=await tx.project.findFirst({where:{id:input.projectId,organizationId:actor.organizationId},select:{startDate:true,expectedEndDate:true,status:true}});
    if(!project)missing();
    if(["COMPLETED","CANCELLED"].includes(project.status))conflict("Closed project milestones cannot be changed.");
    if(input.action!=="transition" && (input.dueDate<ymd(project.startDate)||input.dueDate>ymd(project.expectedEndDate)))conflict("Milestone due date must be within the project schedule.");
    if(input.action==="create"){
      const row=await tx.milestone.create({data:{...where,title:input.title,description:input.description??null,dueDate:new Date(`${input.dueDate}T00:00:00Z`)}});
      await audit(tx,actor,requestId,"MILESTONE_CREATED","MILESTONE",row.id,{title:row.title,dueDate:input.dueDate,status:row.status});return {id:row.id};
    }
    const old=await tx.milestone.findFirst({where:{...where,id:input.milestoneId}});
    if(!old)missing();
    if(old.updatedAt.getTime()!==new Date(input.expectedUpdatedAt).getTime())conflict("Milestone changed. Refresh and retry.");
    if(old.status!=="PLANNED")conflict("Only planned milestones can be modified.");
    const before={title:old.title,description:old.description,dueDate:ymd(old.dueDate),status:old.status,achievedAt:old.achievedAt?.toISOString()??null};
    if(input.action==="edit"){
      await tx.milestone.update({where:{id:old.id},data:{title:input.title,description:input.description??null,dueDate:new Date(`${input.dueDate}T00:00:00Z`)}});
      await audit(tx,actor,requestId,"MILESTONE_UPDATED","MILESTONE",old.id,{title:input.title,description:input.description??null,dueDate:input.dueDate,status:old.status},before);
    }else{
      if(!canTransition(old.status,input.status,ymd(old.dueDate)))conflict("Invalid milestone transition.");
      const achievedAt=input.status==="ACHIEVED"?new Date():null;
      await tx.milestone.update({where:{id:old.id},data:{status:input.status,achievedAt}});
      await audit(tx,actor,requestId,"MILESTONE_STATUS_CHANGED","MILESTONE",old.id,{status:input.status,reason:input.reason,achievedAt:achievedAt?.toISOString()??null},before);
    }
    return {id:old.id};
  });
}
