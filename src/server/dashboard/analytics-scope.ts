import { hasPermission, type AuthorizationContext, type Permission } from "@/server/rbac/policy";
import type { Prisma } from "@/generated/prisma/client";

const probe = "__dashboard_scope_probe__";
export function projectPermissionScope(actor: AuthorizationContext, permission: Permission) {
  const organizationId = actor.organizationId;
  const all = hasPermission(actor, permission, { organizationId, projectId: probe });
  const ids = [...new Set(actor.grants.flatMap(g => g.scope === "project" &&
    hasPermission(actor, permission, { organizationId, projectId: g.projectId }) ? [g.projectId] : []))];
  return { allowed: all || ids.length > 0, where: { organizationId, archivedAt: null,
    ...(all ? {} : { id: { in: ids } }) } satisfies Prisma.ProjectWhereInput };
}
export function sitePermissionScope(actor: AuthorizationContext, permission: Permission) {
  const organizationId = actor.organizationId;
  const all = hasPermission(actor, permission, { organizationId, projectId: probe, siteId: probe });
  const clauses: Prisma.ConstructionSiteWhereInput[] = [];
  for (const g of actor.grants) {
    if (g.scope === "organization") continue;
    if (!hasPermission(actor, permission, { organizationId, projectId: g.projectId,
      siteId: g.scope === "site" ? g.siteId : probe })) continue;
    clauses.push(g.scope === "site" ? { projectId: g.projectId, id: g.siteId } : { projectId: g.projectId });
  }
  return { allowed: all || clauses.length > 0, where: { organizationId, archivedAt: null,
    project: { is: { archivedAt: null } }, ...(all ? {} : { OR: clauses }) } satisfies Prisma.ConstructionSiteWhereInput };
}
export function taskPermissionAvailable(actor: AuthorizationContext) {
  const organizationId = actor.organizationId;
  return hasPermission(actor, "task:view", { organizationId, projectId: probe, siteId: probe }) || actor.grants.some(g =>
    g.scope !== "organization" && hasPermission(actor, "task:view", { organizationId, projectId: g.projectId,
      siteId: g.scope === "site" ? g.siteId : probe, assignedMembershipIds: [actor.membershipId] }));
}
