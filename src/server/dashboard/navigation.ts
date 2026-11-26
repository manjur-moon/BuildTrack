import { hasPermission, type AuthorizationContext, type Permission, type Resource } from "@/server/rbac/policy";

export type DashboardIcon = "layout" | "building" | "hard-hat" | "check-square" | "boxes" | "wallet" | "chart" | "users";
export type DashboardItem = {
  key: string;
  label: string;
  href: string;
  icon: DashboardIcon;
  description: string;
};
export type DashboardGroup = { label: string; items: DashboardItem[] };

type NavDefinition = DashboardItem & { permissions: readonly Permission[]; ownerOnly?: boolean };
const sections: readonly { label: string; items: readonly NavDefinition[] }[] = [
  { label: "Workspace", items: [
    { key: "projects", label: "Projects", href: "/dashboard/projects", icon: "building", description: "Portfolio and construction progress", permissions: ["project:view", "project:summary:view"] },
    { key: "sites", label: "Sites", href: "/dashboard/sites", icon: "hard-hat", description: "Locations and on-site updates", permissions: ["site:view"] },
    { key: "media", label: "Photo evidence", href: "/dashboard/media", icon: "building", description: "Private project and site photography", permissions: ["project:view", "site:view"] },
    { key: "tasks", label: "Tasks", href: "/dashboard/tasks", icon: "check-square", description: "Assigned work and milestones", permissions: ["task:view"] },
    { key: "materials", label: "Materials", href: "/dashboard/materials", icon: "boxes", description: "Inventory and stock movements", permissions: ["inventory:view"] },
  ] },
  { label: "Management", items: [
    { key: "finance", label: "Finance", href: "/dashboard/finance", icon: "wallet", description: "Cost tracking and expenses", permissions: ["expense:view"] },
    { key: "reports", label: "Reports", href: "/dashboard/reports", icon: "chart", description: "Operational and financial intelligence", permissions: ["report:view"] },
    { key: "team", label: "Team & access", href: "/dashboard/team", icon: "users", description: "Members and operational roles", permissions: ["role:assign"], ownerOnly: true },
  ] },
];

const overview: DashboardItem = {
  key: "overview", label: "Overview", href: "/dashboard", icon: "layout", description: "Your construction workspace",
};

/** Navigation is a presentation hint, NOT an authorization boundary. Step 8 endpoints must check live resources. */
function canSee(ctx: AuthorizationContext, item: NavDefinition): boolean {
  if (!ctx.membershipActive || !ctx.emailVerified || !ctx.organizationId) return false;
  if (item.ownerOnly && ctx.betterAuthRole !== "owner") return false;
  const probeResources: Resource[] = [
    { organizationId: ctx.organizationId, projectId: "__navigation_probe__", siteId: "__navigation_probe__", assignedMembershipIds: [ctx.membershipId] },
    ...ctx.grants.map((grant): Resource => ({
      organizationId: ctx.organizationId,
      projectId: grant.scope === "organization" ? "__navigation_probe__" : grant.projectId,
      siteId: grant.scope === "site" ? grant.siteId : "__navigation_probe__",
      assignedMembershipIds: [ctx.membershipId],
    })),
  ];
  return item.permissions.some((permission) => probeResources.some((resource) => hasPermission(ctx, permission, resource)));
}

export function getDashboardNavigation(ctx: AuthorizationContext): DashboardGroup[] {
  const result: DashboardGroup[] = [{ label: "General", items: [overview] }];
  for (const group of sections) {
    const allowed = group.items.filter((item) => canSee(ctx, item)).map((item): DashboardItem => ({
      key: item.key, label: item.label, href: item.href, icon: item.icon, description: item.description,
    }));
    if (allowed.length) result.push({ label: group.label, items: allowed });
  }
  return result;
}

export function getPermittedSection(ctx: AuthorizationContext, key: string): DashboardItem | null {
  return getDashboardNavigation(ctx).flatMap((group) => group.items).find((item) => item.key === key && item.key !== "overview") ?? null;
}
