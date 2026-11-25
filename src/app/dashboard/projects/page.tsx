import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProjectManager } from "@/components/construction/project-manager";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import "@/components/construction/construction.css";

export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "projects")) notFound();
  return <ProjectManager/>;
}
