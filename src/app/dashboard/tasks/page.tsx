import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { hasPermission } from "@/server/rbac/policy";
import { TaskManager } from "@/components/construction/task-manager";
import "@/components/construction/construction.css";
import "@/components/construction/tasks.css";
export const dynamic = "force-dynamic";
export default async function TasksPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "tasks")) notFound();
  const probes = [
    { organizationId: actor.organizationId, projectId: "__task_probe__", siteId: "__task_probe__" },
    ...actor.grants.map((grant) => ({
      organizationId: actor.organizationId, projectId: grant.scope === "organization" ? "__task_probe__" : grant.projectId,
      siteId: grant.scope === "site" ? grant.siteId : "__task_probe__",
    })),
  ];
  const canCreate = probes.some((resource) => hasPermission(actor, "task:create", resource));
  return <TaskManager canCreate={canCreate} />;
}
