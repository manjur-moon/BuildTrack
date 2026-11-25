import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SiteManager } from "@/components/construction/site-manager";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import "@/components/construction/construction.css";

export const dynamic = "force-dynamic";
export default async function SitesPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "sites")) notFound();
  return <SiteManager/>;
}
