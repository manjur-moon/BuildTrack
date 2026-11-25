import { hasPermission, type AuthorizationContext, type Permission, type Resource } from "@/server/rbac/policy";

const probe = "__buildtrack_access_scope_probe__";

/** Returns a DB predicate scope, NEVER a final authorization decision. Per-row checks still apply. */
export function projectReadScope(ctx: AuthorizationContext): { all: boolean; projectIds: string[] } {
  const all = ["project:view", "project:summary:view"].some((permission) =>
    hasPermission(ctx, permission as Permission, { organizationId: ctx.organizationId, projectId: probe }));
  if (all) return { all, projectIds: [] };
  const projectIds = new Set<string>();
  for (const grant of ctx.grants) {
    if (grant.scope === "organization") continue;
    const resource = { organizationId: ctx.organizationId, projectId: grant.projectId };
    if (hasPermission(ctx, "project:view", resource) || hasPermission(ctx, "project:summary:view", resource)) {
      projectIds.add(grant.projectId);
    }
  }
  return { all: false, projectIds: [...projectIds] };
}

export function siteReadScope(ctx: AuthorizationContext): { all: boolean; projectIds: string[]; siteIds: string[] } {
  const all = hasPermission(ctx, "site:view", { organizationId: ctx.organizationId, projectId: probe, siteId: probe });
  if (all) return { all: true, projectIds: [], siteIds: [] };
  const projectIds = new Set<string>();
  const siteIds = new Set<string>();
  for (const grant of ctx.grants) {
    if (grant.scope === "project" && hasPermission(ctx, "site:view", {
      organizationId: ctx.organizationId, projectId: grant.projectId, siteId: probe,
    })) projectIds.add(grant.projectId);
    if (grant.scope === "site" && hasPermission(ctx, "site:view", {
      organizationId: ctx.organizationId, projectId: grant.projectId, siteId: grant.siteId,
    })) siteIds.add(grant.siteId);
  }
  return { all: false, projectIds: [...projectIds], siteIds: [...siteIds] };
}

export function canReadProject(ctx: AuthorizationContext, resource: Resource): "full" | "summary" | null {
  if (hasPermission(ctx, "project:view", resource)) return "full";
  if (hasPermission(ctx, "project:summary:view", resource)) return "summary";
  return null;
}

export function canCreateProject(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, "project:create", { organizationId: ctx.organizationId });
}
export function canCreateSite(ctx: AuthorizationContext, projectId: string): boolean {
  return hasPermission(ctx, "project:update", { organizationId: ctx.organizationId, projectId });
}
