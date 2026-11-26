import { ApiError } from "@/server/api/errors";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { hasPermission,type AuthorizationContext } from "@/server/rbac/policy";
import type { Tx } from "@/server/inventory/transaction";
export function missing():never {throw new ApiError(404,"NOT_FOUND","Report resource not found.");}
export function conflict(message:string):never {throw new ApiError(409,"CONFLICT",message);}
export async function reportAccess(tx:Tx,actor:AuthorizationContext,projectId:string,siteId:string,taskId:string|undefined,write:boolean){
  const organizationId=actor.organizationId;
  const scope={organizationId,projectId,siteId};
  const site=await tx.constructionSite.findFirst({where:{organizationId,projectId,id:siteId,archivedAt:null,project:{is:{archivedAt:null}}},select:{id:true,status:true}});
  if(!site)missing();
  const task=taskId?await tx.task.findFirst({where:{id:taskId,organizationId,projectId,siteId,archivedAt:null},select:{id:true,status:true,assignees:{where:{unassignedAt:null},select:{membershipId:true}}}}):null;
  if(taskId&&!task)missing();
  const permission=write?"site:update":"report:view";
  if(hasPermission(actor,permission,scope)){
    await assertCurrentWriteAccess(tx,actor,permission,scope);
    return {restricted:false,site,task};
  }
  if(!task)missing();
  // Contractor reports are confined to own assigned work. Validate active company affiliation as well as the grant.
  const grants=actor.grants.filter(g=>g.role==="CONTRACTOR"&&g.scope==="project"&&g.projectId===projectId);
  const contractor={...actor,betterAuthRole:"member",grants};
  const taskScope={...scope,assignedMembershipIds:task.assignees.map(a=>a.membershipId)};
  await assertCurrentWriteAccess(tx,contractor,write?"task:status:update":"task:view",taskScope);
  const affiliation=await tx.contractorUser.findFirst({where:{organizationId,membershipId:actor.membershipId,endedAt:null,company:{is:{status:"ACTIVE"}}},select:{contractorId:true}});
  if(!affiliation)missing();
  const assigned=await tx.projectContractorAssignment.findFirst({where:{organizationId,projectId,contractorId:affiliation.contractorId,endedAt:null},select:{id:true}});
  if(!assigned)missing();
  return {restricted:true,site,task};
}
