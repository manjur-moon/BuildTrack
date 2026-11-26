import { headers } from "next/headers";
import { notFound,redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { hasPermission } from "@/server/rbac/policy";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { ProgressManager } from "@/components/progress/progress-manager";
import { dhakaDate } from "@/server/milestones/rules";
export const dynamic="force-dynamic";
export default async function ProgressPage(){
  const actor=await resolveAuthorizationContext(await headers());
  if(!actor)redirect("/dashboard");
  if(!getPermittedSection(actor,"progress"))notFound();
  const organizationId=actor.organizationId;
  const all=hasPermission(actor,"report:view",{organizationId,projectId:"__probe__",siteId:"__probe__"});
  const scopes:Prisma.ConstructionSiteWhereInput[]=[];
  for(const g of actor.grants){
    if(g.scope==="organization")continue;
    if(g.scope==="project"&&g.role!=="CONTRACTOR")scopes.push({projectId:g.projectId});
    if(g.scope==="site")scopes.push({id:g.siteId,projectId:g.projectId});
    if(g.role==="CONTRACTOR")scopes.push({projectId:g.projectId,tasks:{some:{archivedAt:null,assignees:{some:{membershipId:actor.membershipId,unassignedAt:null}}}}});
  }
  const sites=await prisma.constructionSite.findMany({where:{organizationId,archivedAt:null,project:{is:{archivedAt:null}},...(all?{}:{OR:scopes})},select:{id:true,projectId:true,name:true,project:{select:{name:true}}},orderBy:{name:"asc"},take:100});
  const options=await Promise.all(sites.map(async s=>{
    const broad=hasPermission(actor,"report:view",{organizationId,projectId:s.projectId,siteId:s.id});
    const tasks=await prisma.task.findMany({where:{organizationId,projectId:s.projectId,siteId:s.id,archivedAt:null,...(broad?{}:{assignees:{some:{membershipId:actor.membershipId,unassignedAt:null}}})},select:{id:true,title:true},orderBy:{title:"asc"},take:100});
    return {id:s.id,projectId:s.projectId,name:`${s.project.name} — ${s.name}`,tasks,broad,canAttach:hasPermission(actor,"site:update",{organizationId,projectId:s.projectId,siteId:s.id})};
  }));
  return <ProgressManager sites={options} today={dhakaDate()}/>;
}
