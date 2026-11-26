import { headers } from "next/headers";
import { notFound,redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { hasPermission } from "@/server/rbac/policy";
import { ContractorManager } from "@/components/contractors/contractor-manager";
export const dynamic="force-dynamic";
export default async function ContractorsPage(){
  const actor=await resolveAuthorizationContext(await headers());
  if(!actor)redirect("/dashboard");
  if(!hasPermission(actor,"role:assign",{organizationId:actor.organizationId}))notFound();
  return <ContractorManager/>;
}
