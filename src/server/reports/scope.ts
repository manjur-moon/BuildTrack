import type { Prisma } from "@/generated/prisma/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { projectPermissionScope } from "@/server/dashboard/analytics-scope";
export type ReportKind = "timeline" | "finance" | "contractors";
export function reportScope(actor: AuthorizationContext, kind: ReportKind) {
  const project = projectPermissionScope(actor, "project:view");
  if (kind === "finance") return projectPermissionScope(actor, "expense:view");
  const task = projectPermissionScope(actor, "task:view");
  const contract = projectPermissionScope(actor, "contract:view");
  return { allowed: project.allowed && task.allowed && (kind !== "contractors" || contract.allowed),
    where: { AND: [project.where, task.where, ...(kind === "contractors" ? [contract.where] : [])] } satisfies Prisma.ProjectWhereInput };
}
