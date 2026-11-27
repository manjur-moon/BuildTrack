import { hasPermission, type AuthorizationContext } from "../rbac/policy";

/** Stored alerts deliberately contain no resource IDs, names, monetary amounts or historical counts. */
export const alertTemplates = {
  TASK_ASSIGNED: { title: "New task assignment", body: "Work was assigned to you today. Review your current tasks.", href: "/dashboard/tasks" },
  TASK_OVERDUE: { title: "Overdue tasks", body: "Tasks in your accessible work queue need attention. Review the current deadlines.", href: "/dashboard/tasks" },
  PROJECT_DELAYED: { title: "Project schedule alert", body: "Check the current schedule of your authorized projects.", href: "/dashboard/projects" },
  BUDGET_OVERRUN: { title: "Budget alert", body: "Review budget utilization in your authorized financial workspace.", href: "/dashboard/finance" },
  LOW_STOCK: { title: "Low stock", body: "Review current inventory levels in your authorized sites.", href: "/dashboard/materials" },
  MATERIAL_REQUEST: { title: "Pending material requests", body: "Review current requests in your authorized inventory workspace.", href: "/dashboard/materials" },
  REPORT_SUBMITTED: { title: "Daily progress update", body: "Review newly submitted reports in your authorized sites.", href: "/dashboard/progress" },
  SYSTEM: { title: "Workspace notification", body: "Check your workspace for current information.", href: "/dashboard" },
} as const;
export type AlertType = keyof typeof alertTemplates;
export function canUseInbox(actor: AuthorizationContext) {
  return Boolean(actor.organizationId && actor.membershipId && actor.membershipActive && actor.emailVerified);
}
export function visibleAlertTypes(actor: AuthorizationContext): AlertType[] {
  if (!canUseInbox(actor)) return [];
  const org = actor.organizationId;
  const resources = [{ organizationId: org, projectId: "__probe__", siteId: "__probe__", assignedMembershipIds: [actor.membershipId] },
    ...actor.grants.filter(g => g.organizationId === org).map(g => ({ organizationId: org,
      projectId: g.scope === "organization" ? "__probe__" : g.projectId,
      siteId: g.scope === "site" ? g.siteId : "__probe__", assignedMembershipIds: [actor.membershipId] }))];
  const result: AlertType[] = ["SYSTEM"];
  if (resources.some(r => hasPermission(actor, "task:view", r))) result.push("TASK_ASSIGNED", "TASK_OVERDUE");
  if (resources.some(r => hasPermission(actor, "project:view", r) && hasPermission(actor, "task:view", r))) result.push("PROJECT_DELAYED");
  if (resources.some(r => hasPermission(actor, "expense:view", r))) result.push("BUDGET_OVERRUN");
  if (resources.some(r => hasPermission(actor, "inventory:view", r))) result.push("LOW_STOCK", "MATERIAL_REQUEST");
  if (resources.some(r => hasPermission(actor, "report:view", r))) result.push("REPORT_SUBMITTED");
  return result;
}
export function canViewActivity(actor: AuthorizationContext) {
  return hasPermission(actor, "audit:view", { organizationId: actor.organizationId });
}
