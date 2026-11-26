import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { requireLiveProjectLock } from "@/server/construction/locking";
import { inventoryWrite, audit, type Tx } from "@/server/inventory/transaction";
import type { AuthorizationContext } from "@/server/rbac/policy";
import type { ContractorInput } from "./input";
import type { z } from "zod";
import type { contractorQuery } from "./input";
function missing(): never { throw new ApiError(404,"NOT_FOUND","Contractor resource not found."); }
function conflict(message:string): never { throw new ApiError(409,"CONFLICT",message); }
async function authorize(tx: Tx, actor: AuthorizationContext) {
  await assertCurrentWriteAccess(tx, actor,"role:assign",{organizationId:actor.organizationId});
}
export async function listContractors(actor:AuthorizationContext, query:z.output<typeof contractorQuery>) {
  return prisma.$transaction(async tx => {
    await authorize(tx,actor);
    const organizationId=actor.organizationId;
    const where={organizationId,...(query.status?{status:query.status}:{}),...(query.q?{name:{contains:query.q,mode:"insensitive" as const}}:{})};
    const page=Number(query.page);
    const total=await tx.contractorCompany.count({where});
    const items=await tx.contractorCompany.findMany({where,orderBy:[{name:"asc"},{id:"asc"}],skip:(page-1)*20,take:20});
    if (!query.contractorId) return {items,total,page,detail:null};
    const company=await tx.contractorCompany.findFirst({where:{organizationId,id:query.contractorId}});
    if(!company) missing();
    const users=await tx.contractorUser.findMany({where:{organizationId,contractorId:company.id},select:{membershipId:true,endedAt:true,member:{select:{user:{select:{name:true,email:true}}}}},orderBy:{createdAt:"desc"},take:100});
    const assignments=await tx.projectContractorAssignment.findMany({where:{organizationId,contractorId:company.id},select:{projectId:true,endedAt:true,project:{select:{name:true}}},orderBy:{assignedAt:"desc"},take:100});
    // Associated tasks are not an attribution of work performed for the company.
    const taskWhere={organizationId,assignees:{some:{membershipId:{in:users.map(u=>u.membershipId)}}},projectId:{in:assignments.map(a=>a.projectId)}};
    const tasks=await tx.task.findMany({where:taskWhere,select:{id:true,title:true,status:true,projectId:true,dueOn:true,completedAt:true},orderBy:[{dueOn:"desc"},{id:"asc"}],take:20});
    return {items,total,page,detail:{company,users,assignments,tasks,historyLimited:true}};
  });
}
export async function mutateContractor(actor:AuthorizationContext,input:ContractorInput,key:string,requestId:string){
  const organizationId=actor.organizationId;
  return inventoryWrite(actor,`contractor.${input.action}`,key,input,tx=>authorize(tx,actor),async tx=>{
    await authorize(tx,actor);
    if(input.action==="create"){
      const {action: _action,...profile}=input; void _action;
      const row=await tx.contractorCompany.create({data:{organizationId,...profile}});
      await audit(tx,actor,requestId,"contractor.created","ContractorCompany",row.id,{name:row.name});
      return {id:row.id};
    }
    if("projectId" in input) await requireLiveProjectLock(tx,organizationId,input.projectId);
    const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "ContractorCompany" WHERE "organizationId"=${organizationId} AND "id"=${input.contractorId} FOR UPDATE`;
    if(!rows.length) missing();
    const company=await tx.contractorCompany.findFirst({where:{organizationId,id:input.contractorId}});
    if(!company) missing();
    const contractorId=company.id;
    async function revoke(membershipIds:string[], projectIds?:string[]){
      if(!membershipIds.length)return;
      await tx.operationalRoleAssignment.updateMany({where:{organizationId,role:"CONTRACTOR",membershipId:{in:membershipIds},revokedAt:null,...(projectIds?{projectId:{in:projectIds}}:{})},data:{revokedAt:new Date(),revokedByMembershipId:actor.membershipId}});
    }
    if(input.action==="edit"){
      const {action: _action,contractorId: _id,...profile}=input; void _action; void _id;
      await tx.contractorCompany.update({where:{id:contractorId},data:profile});
    }else if(input.action==="status"){
      await tx.contractorCompany.update({where:{id:contractorId},data:{status:input.status}});
      if(input.status!=="ACTIVE"){
        const users=await tx.contractorUser.findMany({where:{organizationId,contractorId,endedAt:null},select:{membershipId:true}});
        await revoke(users.map(u=>u.membershipId));
      }
    }else if(input.action==="link" || input.action==="unlink"){
      const member=await tx.member.findFirst({where:{organizationId,id:input.membershipId},select:{id:true,role:true,disabledAt:true,user:{select:{emailVerified:true}}}});
      if(!member)missing();
      const existing=await tx.contractorUser.findFirst({where:{organizationId,membershipId:member.id}});
      if(input.action==="unlink"){
        if(!existing || existing.contractorId!==contractorId)missing();
        await tx.contractorUser.update({where:{id:existing.id},data:{endedAt:new Date()}});
        await revoke([member.id]);
      }else{
        if(company.status!=="ACTIVE" || member.disabledAt || !member.user.emailVerified || member.role!=="member") conflict("Use a verified active non-privileged member and active company.");
        if(existing && existing.contractorId!==contractorId) conflict("Member belongs to another contractor; transfer is not supported.");
        if(existing) await tx.contractorUser.update({where:{id:existing.id},data:{endedAt:null}});
        else await tx.contractorUser.create({data:{organizationId,contractorId,membershipId:member.id}});
      }
    }else if(input.action==="assign" || input.action==="end"){
      const existing=await tx.projectContractorAssignment.findFirst({where:{organizationId,contractorId,projectId:input.projectId}});
      if(input.action==="end"){
        if(!existing)missing();
        await tx.projectContractorAssignment.update({where:{id:existing.id},data:{endedAt:new Date()}});
        const users=await tx.contractorUser.findMany({where:{organizationId,contractorId},select:{membershipId:true}});
        await revoke(users.map(u=>u.membershipId),[input.projectId]);
      }else{
        if(company.status!=="ACTIVE")conflict("Company is not active.");
        const project=await tx.project.findFirst({where:{organizationId,id:input.projectId,status:{in:["PLANNED","ACTIVE","ON_HOLD"]}}});
        if(!project)conflict("Project is not open.");
        if(existing)await tx.projectContractorAssignment.update({where:{id:existing.id},data:{endedAt:null}});
        else await tx.projectContractorAssignment.create({data:{organizationId,contractorId,projectId:input.projectId,assignedByMembershipId:actor.membershipId}});
      }
    }else if(input.action==="grant"){
      if(company.status!=="ACTIVE")conflict("Company is not active.");
      const link=await tx.contractorUser.findFirst({where:{organizationId,contractorId,membershipId:input.membershipId,endedAt:null,member:{is:{disabledAt:null,role:"member",user:{is:{emailVerified:true}}}}}});
      const assignment=await tx.projectContractorAssignment.findFirst({where:{organizationId,contractorId,projectId:input.projectId,endedAt:null,project:{is:{status:{in:["PLANNED","ACTIVE","ON_HOLD"]}}}}});
      if(!link||!assignment)missing();
      const projectId=input.projectId,membershipId=input.membershipId;
      await tx.projectMember.upsert({where:{organizationId_projectId_membershipId:{organizationId,projectId,membershipId}},create:{organizationId,projectId,membershipId},update:{leftAt:null}});
      const active=await tx.operationalRoleAssignment.findFirst({where:{organizationId,projectId,membershipId,role:"CONTRACTOR",scope:"PROJECT",revokedAt:null}});
      if(active?.expiresAt && active.expiresAt<=new Date()) await revoke([membershipId],[projectId]);
      if(!active || (active.expiresAt && active.expiresAt<=new Date()))await tx.operationalRoleAssignment.create({data:{organizationId,projectId,membershipId,role:"CONTRACTOR",scope:"PROJECT",grantedByMembershipId:actor.membershipId}});
    }
    await audit(tx,actor,requestId,`contractor.${input.action}`,"ContractorCompany",contractorId,{ action:input.action, ...("membershipId" in input?{membershipId:input.membershipId}:{}), ...("projectId" in input?{projectId:input.projectId}:{}), ...(input.action==="status"?{status:input.status}:{}), ...(input.action==="edit"?{name:input.name}:{}) }, {name:company.name,status:company.status});
    return {id:contractorId};
  });
}
