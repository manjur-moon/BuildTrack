import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { hasPermission } from "@/server/rbac/policy";
import { prisma } from "@/server/db/client";
import { FinanceManager } from "@/components/finance/finance-manager";
export const dynamic = "force-dynamic";
export default async function FinancePage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor,"finance")) notFound();
  const all = hasPermission(actor,"expense:view",{organizationId:actor.organizationId,projectId:"__probe__"});
  const ids = actor.grants.flatMap(g => g.scope === "project" && hasPermission(actor,"expense:view",{organizationId:actor.organizationId,projectId:g.projectId}) ? [g.projectId] : []);
  const projects = await prisma.project.findMany({where:{organizationId:actor.organizationId,archivedAt:null,...(all?{}:{id:{in:ids}})},select:{id:true,name:true,code:true},orderBy:{name:"asc"},take:100});
  return <FinanceManager projects={projects}/>;
}
