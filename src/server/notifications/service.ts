import { createHash } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/server/api/errors";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { taskReadScope } from "@/server/construction/task-scope";
import { projectPermissionScope, sitePermissionScope } from "@/server/dashboard/analytics-scope";
import { scopedInventoryWhere } from "@/server/inventory/permissions";
import { dhakaDate } from "@/server/milestones/rules";
import { cents } from "@/server/finance/money";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { alertTemplates, canUseInbox, canViewActivity, visibleAlertTypes, type AlertType } from "./rules";
import type { ActivityQuery, InboxMutation, InboxQuery } from "./input";
const PAGE_SIZE = 20;
type Tx = Prisma.TransactionClient;

async function assertActiveMember(tx: Tx, actor: AuthorizationContext) {
  if (!canUseInbox(actor)) throw new ApiError(403, "FORBIDDEN", "Active membership required.");
  const member = await tx.member.findFirst({ where: { id: actor.membershipId, organizationId: actor.organizationId,
    disabledAt: null, user: { is: { emailVerified: true } } }, select: { id: true } });
  if (!member) throw new ApiError(403, "FORBIDDEN", "Active membership required.");
}
function inboxScope(actor: AuthorizationContext): Prisma.NotificationWhereInput {
  return { organizationId: actor.organizationId, recipientMembershipId: actor.membershipId,
    type: { in: visibleAlertTypes(actor) }, resourceId: null, resourceType: null };
}
/** Never expose legacy free-form bodies or navigation targets; current scope is resolved per HTTP request. */
export async function listNotifications(actor: AuthorizationContext, query: InboxQuery) {
  return prisma.$transaction(async tx => {
    await assertActiveMember(tx, actor);
    const scope = inboxScope(actor);
    const where: Prisma.NotificationWhereInput = { ...scope, ...(query.filter === "unread" ? { readAt: null } : query.filter === "read" ? { readAt: { not: null } } : {}) };
    const unread = await tx.notification.count({ where: { ...scope, readAt: null } });
    const total = await tx.notification.count({ where });
    const rows = await tx.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, type: true, createdAt: true, readAt: true } });
    return { unread, total, page: query.page, pageSize: PAGE_SIZE, items: rows.map(r => ({ id: r.id, type: r.type,
      ...alertTemplates[r.type], createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null })) };
  }, { isolationLevel: "RepeatableRead" });
}

/** Pull-based daily alerts; no cron, no cross-member fan-out, no secret historical payload. */
async function currentAlerts(tx: Tx, actor: AuthorizationContext, now: Date): Promise<AlertType[]> {
  const allowed = visibleAlertTypes(actor), alerts: AlertType[] = [];
  const org = actor.organizationId, today = dhakaDate(now), boundary = new Date(`${today}T00:00:00Z`);
  const start = new Date(`${today}T00:00:00+06:00`);
  const tasks = taskReadScope(actor);
  if (allowed.includes("TASK_ASSIGNED") && await tx.task.findFirst({ where: { AND: [tasks, { status: { not: "COMPLETED" }, assignees: { some: {
    organizationId: org, membershipId: actor.membershipId, unassignedAt: null, assignedAt: { gte: start, lte: now }, projectMember: { is: { leftAt: null } },
  } } }] }, select: { id: true } })) alerts.push("TASK_ASSIGNED");
  if (allowed.includes("TASK_OVERDUE") && await tx.task.findFirst({ where: { AND: [tasks, { status: { not: "COMPLETED" }, dueOn: { lt: boundary } }] }, select: { id: true } })) alerts.push("TASK_OVERDUE");
  if (allowed.includes("PROJECT_DELAYED")) {
    const view = projectPermissionScope(actor, "project:view"), taskView = projectPermissionScope(actor, "task:view");
    if (await tx.project.findFirst({ where: { AND: [view.where, taskView.where, { status: { notIn: ["COMPLETED", "CANCELLED"] }, expectedEndDate: { lt: boundary } }] }, select: { id: true } })) alerts.push("PROJECT_DELAYED");
  }
  if (allowed.includes("BUDGET_OVERRUN")) {
    const finance = projectPermissionScope(actor, "expense:view");
    const scope = { organizationId: org, project: { is: finance.where } };
    const budgets = await tx.projectBudget.findMany({ where: scope, select: { projectId: true, approvedAmount: true, currency: true } });
    const spent = await tx.expense.groupBy({ by: ["projectId"], where: { ...scope, status: "POSTED" }, _sum: { amount: true } });
    const sums = new Map(spent.map(r => [r.projectId, cents(r._sum.amount?.toFixed(2) ?? "0")]));
    if (budgets.some(b => b.currency === "BDT" && (sums.get(b.projectId) ?? 0n) > cents(b.approvedAmount.toFixed(2)))) alerts.push("BUDGET_OVERRUN");
  }
  if (allowed.includes("LOW_STOCK")) {
    const site = { is: scopedInventoryWhere(actor) };
    if (await tx.siteInventory.findFirst({ where: { organizationId: org, site, material: { is: { archivedAt: null } },
      reorderLevel: { gt: 0 }, onHand: { lte: tx.siteInventory.fields.reorderLevel } }, select: { id: true } })) alerts.push("LOW_STOCK");
    if (await tx.materialRequest.findFirst({ where: { organizationId: org, site, status: "PENDING" }, select: { id: true } })) alerts.push("MATERIAL_REQUEST");
  }
  if (allowed.includes("REPORT_SUBMITTED")) {
    const scope = sitePermissionScope(actor, "report:view");
    if (await tx.dailyProgressReport.findFirst({ where: { organizationId: org, site: { is: scope.where }, submittedAt: { gte: start, lte: now } }, select: { id: true } })) alerts.push("REPORT_SUBMITTED");
  }
  return alerts;
}
export async function mutateNotifications(actor: AuthorizationContext, input: InboxMutation, now = new Date()) {
  return prisma.$transaction(async tx => {
    await assertActiveMember(tx, actor);
    const scope = inboxScope(actor);
    if (input.action === "refresh") {
      const types = await currentAlerts(tx, actor, now);
      if (!types.length) return { changed: 0 };
      const result = await tx.notification.createMany({ data: types.map(type => ({
        id: "digest_" + createHash("sha256").update(JSON.stringify([actor.organizationId, actor.membershipId, dhakaDate(now), type])).digest("hex"),
        organizationId: actor.organizationId, recipientMembershipId: actor.membershipId, type,
        title: alertTemplates[type].title, body: alertTemplates[type].body, createdAt: now,
      })), skipDuplicates: true });
      return { changed: result.count };
    }
    if (input.action === "read-all") {
      return { changed: (await tx.notification.updateMany({ where: { ...scope, readAt: null }, data: { readAt: now } })).count };
    }
    const row = await tx.notification.findFirst({ where: { ...scope, id: input.id }, select: { id: true } });
    if (!row) throw new ApiError(404, "NOT_FOUND", "Notification not found.");
    const result = await tx.notification.updateMany({ where: { ...scope, id: input.id, readAt: input.read ? null : { not: null } }, data: { readAt: input.read ? now : null } });
    return { changed: result.count };
  }, { timeout: 20000 });
}

/** Audit history is organization-admin-only; deliberately return metadata, never snapshots or IPs. */
export async function listActivity(actor: AuthorizationContext, query: ActivityQuery) {
  if (!canViewActivity(actor)) throw new ApiError(403, "FORBIDDEN", "Audit access required.");
  return prisma.$transaction(async tx => {
    await assertActiveMember(tx, actor);
    await assertCurrentWriteAccess(tx, actor, "audit:view", { organizationId: actor.organizationId });
    const where: Prisma.AuditEventWhereInput = { organizationId: actor.organizationId,
      ...(query.q ? { OR: [{ action: { contains: query.q, mode: "insensitive" } }, { resourceType: { contains: query.q, mode: "insensitive" } }] } : {}) };
    const total = await tx.auditEvent.count({ where });
    const rows = await tx.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, action: true, resourceType: true, createdAt: true, actor: { select: { user: { select: { name: true } } } } } });
    return { total, page: query.page, pageSize: PAGE_SIZE, items: rows.map(r => ({ id: r.id, action: r.action, resourceType: r.resourceType,
      actorName: r.actor?.user.name ?? "System / unknown", createdAt: r.createdAt.toISOString() })) };
  }, { isolationLevel: "RepeatableRead" });
}
