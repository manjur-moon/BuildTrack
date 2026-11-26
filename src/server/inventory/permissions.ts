// Pure permission and query-scope helpers: no database client initialization.
import { hasPermission, type AuthorizationContext } from "../rbac/policy";
import type { Prisma } from "@/generated/prisma/client";

const probe = "__inventory_scope_probe__";
export function canViewInventory(actor: AuthorizationContext) {
  if (hasPermission(actor, "inventory:view", { organizationId: actor.organizationId, projectId: probe, siteId: probe })) return true;
  return actor.grants.some((g) => hasPermission(actor, "inventory:view", {
    organizationId: actor.organizationId,
    projectId: g.scope === "organization" ? probe : g.projectId,
    siteId: g.scope === "site" ? g.siteId : probe,
  }));
}
export function canManageCatalog(actor: AuthorizationContext) {
  return hasPermission(actor, "material:manage", { organizationId: actor.organizationId });
}
export function scopedInventoryWhere(actor: AuthorizationContext): Prisma.ConstructionSiteWhereInput {
  const base: Prisma.ConstructionSiteWhereInput = { organizationId: actor.organizationId, archivedAt: null,
    project: { is: { archivedAt: null } }, status: { not: "CLOSED" } };
  if (hasPermission(actor, "inventory:view", { organizationId: actor.organizationId, projectId: probe, siteId: probe })) return base;
  const projects = new Set<string>(), sites = new Set<string>();
  for (const g of actor.grants) {
    if (g.organizationId !== actor.organizationId || g.scope === "organization") continue;
    if (g.scope === "project" && hasPermission(actor, "inventory:view", { organizationId: actor.organizationId, projectId: g.projectId, siteId: probe })) projects.add(g.projectId);
    if (g.scope === "site" && hasPermission(actor, "inventory:view", { organizationId: actor.organizationId, projectId: g.projectId, siteId: g.siteId })) sites.add(g.siteId);
  }
  return { ...base, OR: [{ projectId: { in: [...projects] } }, { id: { in: [...sites] } }] };
}
