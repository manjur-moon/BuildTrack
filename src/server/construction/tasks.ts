import { createsDependencyCycle } from "./dependency-graph";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import type { Prisma } from "@/generated/prisma/client";
import { assertCurrentWriteAccess } from "./write-access";
import { idempotentCreate } from "./idempotency";
import { requireLiveProjectLock, lockSiteRow, rethrowConstructionConflict } from "./locking";
import { taskReadScope, taskListFilter } from "./task-scope";
import { validateProgressTransition, type TaskStatus, type TaskListQuery,
  type CreateTaskInput, type UpdateTaskInput, type UpdateTaskProgressInput, type ArchiveTaskInput } from "./task-input";

const taskSelect = {
  id: true, organizationId: true, projectId: true, siteId: true,
  title: true, description: true, priority: true, status: true,
  progressPercent: true, startsOn: true, dueOn: true, completedAt: true,
  createdByMembershipId: true, createdAt: true, updatedAt: true,
  project: { select: { name: true, code: true } },
  site: { select: { name: true } },
  incomingDependencies: { select: { predecessor: { select: { status: true, archivedAt: true } } } },
  assignees: { where: { unassignedAt: null }, select: {
    membershipId: true, projectMember: { select: { member: { select: { user: { select: { name: true } } } } } },
  } },
} as const;
type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;
type TaskTx = Pick<typeof prisma, "$queryRaw" | "task" | "project" | "constructionSite" | "taskAssignment" |
  "taskStatusHistory" | "auditEvent" | "projectMember" | "siteAssignment" | "member" |
  "operationalRoleAssignment" | "contractorUser" | "projectContractorAssignment">;
const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);
const day = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;
const resourceFor = (actor: AuthorizationContext, row: TaskRow) => ({
  organizationId: actor.organizationId, projectId: row.projectId, siteId: row.siteId ?? undefined,
  assignedMembershipIds: row.assignees.map((assignment) => assignment.membershipId),
});
function taskDto(actor: AuthorizationContext, row: TaskRow) {
  const resource = resourceFor(actor, row);
  const mayEdit = hasPermission(actor, "task:update", resource);
  const mayAssign = hasPermission(actor, "task:assign", resource);
  const mayReport = hasPermission(actor, "task:status:update", resource);
  return {
    id: row.id, projectId: row.projectId, projectName: row.project.name, projectCode: row.project.code,
    siteId: row.siteId, siteName: row.site?.name ?? null,
    title: row.title, description: row.description, priority: row.priority,
    blocked: row.incomingDependencies.some(({ predecessor }) => predecessor.status !== "COMPLETED" || predecessor.archivedAt !== null),
    status: row.status, progressPercent: Number(row.progressPercent),
    startsOn: day(row.startsOn), dueOn: day(row.dueOn),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    assignees: row.assignees.map((assignment) => ({ id: assignment.membershipId,
      name: assignment.projectMember.member.user.name })),
    canEdit: mayEdit, canAssign: mayAssign, canArchive: mayEdit,
    canReportProgress: mayReport && row.status !== "COMPLETED",
    canApprove: mayEdit && row.status === "REVIEW",
  };
}
function isVisible(actor: AuthorizationContext, row: TaskRow) {
  return hasPermission(actor, "task:view", resourceFor(actor, row));
}
function notFound(): never { throw new ApiError(404, "NOT_FOUND", "Task not found."); }
function conflict(message: string): never { throw new ApiError(409, "CONFLICT", message); }

export async function listTasks(actor: AuthorizationContext, query: TaskListQuery) {
  const where: Prisma.TaskWhereInput = {
    organizationId: actor.organizationId, archivedAt: null,
    AND: [taskReadScope(actor), taskListFilter(actor, query)],
  };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, select: taskSelect,
      orderBy: [{ [query.sortBy]: query.order }, { id: "desc" }],
      skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.task.count({ where }),
  ]);
  const items = rows.filter((row) => isVisible(actor, row)).map((row) => taskDto(actor, row));
  return { items, total, page: query.page, limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
    hasNext: query.page * query.limit < total, hasPrevious: query.page > 1 };
}

export async function getTask(actor: AuthorizationContext, taskId: string) {
  const row = await prisma.task.findFirst({ where: {
    organizationId: actor.organizationId, id: taskId, archivedAt: null, AND: [taskReadScope(actor)],
  }, select: taskSelect });
  if (!row || !isVisible(actor, row)) notFound();
  return taskDto(actor, row);
}

async function lockedTask(tx: TaskTx, actor: AuthorizationContext, taskId: string): Promise<TaskRow> {
  // Read the immutable project/site relation before acquiring locks in global order.
  const initial = await tx.task.findFirst({ where: { organizationId: actor.organizationId, id: taskId,
    archivedAt: null }, select: { projectId: true, siteId: true } });
  if (!initial) notFound();
  await requireLiveProjectLock(tx, actor.organizationId, initial.projectId);
  if (initial.siteId) {
    const site = await lockSiteRow(tx, actor.organizationId, initial.projectId, initial.siteId);
    if (!site || site.archivedAt || site.status === "CLOSED") conflict("Site is no longer active.");
  }
  const matches = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Task"
    WHERE "id" = ${taskId} AND "organizationId" = ${actor.organizationId}
      AND "projectId" = ${initial.projectId} AND "archivedAt" IS NULL
    FOR UPDATE
  `;
  if (!matches.length) notFound();
  const current = await tx.task.findFirst({ where: {
    id: taskId, organizationId: actor.organizationId, archivedAt: null,
  }, select: taskSelect });
  if (!current) notFound();
  return current;
}

export async function createTask(actor: AuthorizationContext, input: CreateTaskInput, requestId: string, key: string) {
  const resource = { organizationId: actor.organizationId, projectId: input.projectId,
    siteId: input.siteId ?? undefined };
  if (!hasPermission(actor, "task:create", resource)) notFound();
  return idempotentCreate(actor, "construction.task.create", key, input, async (tx, id) => {
    await requireLiveProjectLock(tx, actor.organizationId, input.projectId);
    if (input.siteId) {
      const site = await lockSiteRow(tx, actor.organizationId, input.projectId, input.siteId);
      if (!site || site.archivedAt) notFound();
    }
    const task = await tx.task.findFirst({ where: { id, organizationId: actor.organizationId,
      projectId: input.projectId, siteId: input.siteId ?? null, archivedAt: null }, select: { id: true } });
    if (!task) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:create", resource);
  }, async (tx) => {
    await requireLiveProjectLock(tx, actor.organizationId, input.projectId);
    const project = await tx.project.findFirst({ where: {
      id: input.projectId, organizationId: actor.organizationId, archivedAt: null,
    }, select: { status: true, startDate: true } });
    if (!project) notFound();
    if (project.status === "COMPLETED" || project.status === "CANCELLED") conflict("Project is closed for new tasks.");
    if (input.siteId) {
      const siteLock = await lockSiteRow(tx, actor.organizationId, input.projectId, input.siteId);
      if (!siteLock || siteLock.archivedAt || siteLock.status === "CLOSED") notFound();
    }
    await assertCurrentWriteAccess(tx, actor, "task:create", resource);
    const row = await tx.task.create({ data: {
      organizationId: actor.organizationId, projectId: input.projectId,
      siteId: input.siteId ?? null, title: input.title, description: input.description ?? null,
      priority: input.priority, startsOn: input.startsOn ? utc(input.startsOn) : null,
      dueOn: utc(input.dueOn), createdByMembershipId: actor.membershipId,
    }, select: taskSelect });
    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "TASK_CREATED", resourceType: "TASK", resourceId: row.id, requestId,
      after: { projectId: row.projectId, siteId: row.siteId, title: row.title,
        status: row.status, priority: row.priority },
    } });
    return taskDto(actor, row);
  }).catch(rethrowConstructionConflict);
}

export async function updateTask(actor: AuthorizationContext, taskId: string, input: UpdateTaskInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, row);
    if (!hasPermission(actor, "task:update", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:update", resource);
    if (row.status === "COMPLETED") conflict("Completed task metadata is locked.");
    const startsOn = input.startsOn === undefined ? day(row.startsOn) : input.startsOn;
    const dueOn = input.dueOn ?? day(row.dueOn);
    if (!dueOn || (startsOn && startsOn > dueOn)) throw new ApiError(422, "VALIDATION_ERROR", "Start date cannot follow due date.");
    const result = await tx.task.updateMany({ where: {
      id: taskId, organizationId: actor.organizationId, archivedAt: null,
      updatedAt: new Date(input.expectedUpdatedAt),
    }, data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsOn !== undefined ? { startsOn: input.startsOn ? utc(input.startsOn) : null } : {}),
      ...(input.dueOn !== undefined ? { dueOn: utc(input.dueOn) } : {}),
    } });
    if (result.count !== 1) conflict("Task changed since you opened it. Refresh and retry.");
    const updated = await tx.task.findFirstOrThrow({ where: { id: taskId, organizationId: actor.organizationId }, select: taskSelect });
    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "TASK_UPDATED", resourceType: "TASK", resourceId: taskId, requestId,
      before: { title: row.title, priority: row.priority, dueOn: day(row.dueOn) },
      after: { title: updated.title, priority: updated.priority, dueOn: day(updated.dueOn) },
    } });
    return taskDto(actor, updated);
  }).catch(rethrowConstructionConflict);
}

export async function updateTaskProgress(actor: AuthorizationContext, taskId: string,
  input: UpdateTaskProgressInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, row);
    if (!hasPermission(actor, "task:status:update", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:status:update", resource);
    // Current TaskAssignment must be checked within the transaction for contractors.
    if (actor.grants.some((grant) => grant.role === "CONTRACTOR" && grant.scope === "project" &&
        grant.projectId === row.projectId) && !hasPermission({ ...actor,
      grants: actor.grants.filter((grant) => grant.role !== "CONTRACTOR") }, "task:status:update", resource)) {
      const active = await tx.taskAssignment.count({ where: {
        organizationId: actor.organizationId, taskId, membershipId: actor.membershipId,
        unassignedAt: null, projectMember: { is: { leftAt: null } },
      } });
      if (!active) notFound();
    }
    const canApprove = hasPermission(actor, "task:update", resource);
    validateProgressTransition(row.status as TaskStatus, input.status, input.progressPercent, canApprove);
    if (input.status !== "TODO" && row.incomingDependencies.some(({ predecessor }) => predecessor.status !== "COMPLETED" || predecessor.archivedAt !== null)) {
      conflict("Complete all prerequisites before progressing this task.");
    }
    if (input.status === row.status && input.progressPercent === Number(row.progressPercent)) {
      conflict("No progress or status change was submitted.");
    }
    const result = await tx.task.updateMany({ where: { id: taskId, organizationId: actor.organizationId,
      archivedAt: null, updatedAt: new Date(input.expectedUpdatedAt) }, data: {
      status: input.status, progressPercent: input.progressPercent,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
    } });
    if (result.count !== 1) conflict("Task changed since you opened it. Refresh and retry.");
    if (row.status !== input.status) {
      await tx.taskStatusHistory.create({ data: {
        organizationId: actor.organizationId, taskId,
        fromStatus: row.status, toStatus: input.status,
        actorMembershipId: actor.membershipId, note: input.note || null,
      } });
    }
    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "TASK_PROGRESS_UPDATED", resourceType: "TASK", resourceId: taskId, requestId,
      before: { status: row.status, progressPercent: Number(row.progressPercent) },
      after: { status: input.status, progressPercent: input.progressPercent, note: input.note || null },
    } });
    const updated = await tx.task.findFirstOrThrow({ where: { id: taskId, organizationId: actor.organizationId }, select: taskSelect });
    return taskDto(actor, updated);
  }).catch(rethrowConstructionConflict);
}

/** Assignees must be enrolled members with an active role applicable to the task. */
async function assertEligibleAssignee(tx: TaskTx, actor: AuthorizationContext, task: TaskRow, membershipId: string) {
  const member = await tx.member.findFirst({ where: { id: membershipId,
    organizationId: actor.organizationId, disabledAt: null,
    user: { is: { emailVerified: true } },
  }, select: { id: true, role: true } });
  if (!member) throw new ApiError(422, "VALIDATION_ERROR", "Assignee is not an active verified member.");
  const enrollment = await tx.projectMember.findFirst({ where: {
    organizationId: actor.organizationId, projectId: task.projectId,
    membershipId, leftAt: null,
  }, select: { id: true } });
  if (!enrollment) throw new ApiError(422, "VALIDATION_ERROR", "Assignee must be enrolled in this project first.");
  const roles = await tx.operationalRoleAssignment.findMany({ where: {
    organizationId: actor.organizationId, membershipId, revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  }, select: { role: true, scope: true, projectId: true, siteId: true } });
  const applicable = member.role === "owner" || roles.some((r) =>
    (r.role === "ADMIN" && r.scope === "ORGANIZATION") ||
    (r.role === "PROJECT_MANAGER" && r.scope === "PROJECT" && r.projectId === task.projectId) ||
    (r.role === "SITE_ENGINEER" && r.scope === "SITE" && !!task.siteId && r.projectId === task.projectId && r.siteId === task.siteId) ||
    (r.role === "CONTRACTOR" && r.scope === "PROJECT" && r.projectId === task.projectId),
  );
  if (!applicable) throw new ApiError(422, "VALIDATION_ERROR", "Assignee has no active role for this task.");
  const requiresSite = member.role !== "owner" &&
    roles.some((r) => r.role === "SITE_ENGINEER" && r.siteId === task.siteId) &&
    !roles.some((r) => (r.role === "PROJECT_MANAGER" && r.projectId === task.projectId) ||
      (r.role === "ADMIN" && r.scope === "ORGANIZATION") ||
      (r.role === "CONTRACTOR" && r.projectId === task.projectId));
  if (requiresSite && task.siteId) {
    const siteEnrollment = await tx.siteAssignment.findFirst({ where: {
      organizationId: actor.organizationId, projectId: task.projectId, siteId: task.siteId,
      membershipId, endedAt: null,
    }, select: { id: true } });
    if (!siteEnrollment) throw new ApiError(422, "VALIDATION_ERROR", "Engineer is not enrolled at this site.");
  }
  if (roles.some((r) => r.role === "CONTRACTOR" && r.projectId === task.projectId) &&
      !roles.some((r) => r.role === "PROJECT_MANAGER" || r.role === "SITE_ENGINEER" || r.role === "ADMIN")) {
    const link = await tx.contractorUser.findFirst({ where: {
      organizationId: actor.organizationId, membershipId, endedAt: null,
      company: { is: { status: "ACTIVE" } },
    }, select: { contractorId: true } });
    if (!link) throw new ApiError(422, "VALIDATION_ERROR", "Contractor affiliation is inactive.");
    const projectLink = await tx.projectContractorAssignment.findFirst({ where: {
      organizationId: actor.organizationId, projectId: task.projectId,
      contractorId: link.contractorId, endedAt: null,
    }, select: { id: true } });
    if (!projectLink) throw new ApiError(422, "VALIDATION_ERROR", "Contractor is not assigned to the project.");
  }
}

export async function listTaskAssigneeCandidates(actor: AuthorizationContext, taskId: string) {
  const task = await prisma.task.findFirst({ where: {
    organizationId: actor.organizationId, id: taskId, archivedAt: null,
    AND: [taskReadScope(actor)],
  }, select: taskSelect });
  if (!task || !hasPermission(actor, "task:assign", resourceFor(actor, task))) notFound();
  const memberships = await prisma.projectMember.findMany({ where: {
    organizationId: actor.organizationId, projectId: task.projectId,
    leftAt: null, member: { is: { disabledAt: null, user: { is: { emailVerified: true } } } },
  }, select: { membershipId: true, member: { select: { role: true, user: { select: { name: true } } } } },
    orderBy: { joinedAt: "asc" }, take: 200 });
  const ids = memberships.map((row) => row.membershipId);
  const now = new Date();
  const [grants, siteAssignments, contractorLinks] = await Promise.all([
    prisma.operationalRoleAssignment.findMany({ where: {
      organizationId: actor.organizationId, membershipId: { in: ids }, revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    }, select: { membershipId: true, role: true, scope: true, projectId: true, siteId: true } }),
    task.siteId ? prisma.siteAssignment.findMany({ where: {
      organizationId: actor.organizationId, projectId: task.projectId, siteId: task.siteId,
      endedAt: null, membershipId: { in: ids },
    }, select: { membershipId: true } }) : Promise.resolve([]),
    prisma.contractorUser.findMany({ where: {
      organizationId: actor.organizationId, membershipId: { in: ids }, endedAt: null,
      company: { is: { status: "ACTIVE", assignments: { some: {
        organizationId: actor.organizationId, projectId: task.projectId, endedAt: null,
      } } } },
    }, select: { membershipId: true } }),
  ]);
  const activeSiteMembers = new Set(siteAssignments.map((a) => a.membershipId));
  const activeContractors = new Set(contractorLinks.map((a) => a.membershipId));
  const candidates = memberships.filter((row) => row.member.role === "owner" || grants.some((g) => {
    if (g.membershipId !== row.membershipId) return false;
    if (g.role === "ADMIN" && g.scope === "ORGANIZATION") return true;
    if (g.role === "PROJECT_MANAGER" && g.scope === "PROJECT" && g.projectId === task.projectId) return true;
    if (g.role === "SITE_ENGINEER" && g.scope === "SITE" && g.siteId === task.siteId &&
        g.projectId === task.projectId && activeSiteMembers.has(row.membershipId)) return true;
    return g.role === "CONTRACTOR" && g.scope === "PROJECT" && g.projectId === task.projectId &&
      activeContractors.has(row.membershipId);
  })).map((row) => ({ id: row.membershipId, name: row.member.user.name }));
  // POST rechecks all grants and enrollments inside a locked write transaction.
  return { candidates, active: task.assignees.map((row) => row.membershipId),
    truncated: memberships.length === 200 };
}

export async function assignTask(actor: AuthorizationContext, taskId: string,
  membershipId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, task);
    if (!hasPermission(actor, "task:assign", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:assign", resource);
    if (task.status === "COMPLETED") conflict("Completed tasks cannot receive new assignments.");
    await assertEligibleAssignee(tx, actor, task, membershipId);
    const existing = await tx.taskAssignment.findFirst({ where: {
      organizationId: actor.organizationId, taskId, membershipId,
    }, select: { id: true, unassignedAt: true } });
    if (existing?.unassignedAt === null) conflict("Member is already assigned to the task.");
    if (existing) {
      await tx.taskAssignment.update({ where: { id: existing.id }, data: { unassignedAt: null, assignedAt: new Date() } });
    } else {
      await tx.taskAssignment.create({ data: { organizationId: actor.organizationId,
        projectId: task.projectId, taskId, membershipId } });
    }
    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "TASK_ASSIGNED", resourceType: "TASK", resourceId: taskId, requestId,
      after: { membershipId },
    } });
    const updated = await tx.task.findFirstOrThrow({ where: { id: taskId, organizationId: actor.organizationId }, select: taskSelect });
    return taskDto(actor, updated);
  }).catch(rethrowConstructionConflict);
}

export async function unassignTask(actor: AuthorizationContext, taskId: string,
  membershipId: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, task);
    if (!hasPermission(actor, "task:assign", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:assign", resource);
    const active = await tx.taskAssignment.count({ where: {
      organizationId: actor.organizationId, taskId, membershipId, unassignedAt: null,
    } });
    if (!active) notFound();
    const remaining = await tx.taskAssignment.count({ where: {
      organizationId: actor.organizationId, taskId, unassignedAt: null,
    } });
    if (remaining <= 1 && task.status !== "COMPLETED") {
      conflict("Assign a replacement before removing the last assignee from unfinished work.");
    }
    await tx.taskAssignment.updateMany({ where: { organizationId: actor.organizationId,
      taskId, membershipId, unassignedAt: null }, data: { unassignedAt: new Date() } });
    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "TASK_UNASSIGNED", resourceType: "TASK", resourceId: taskId, requestId,
      before: { membershipId }, after: { removed: true },
    } });
    const updated = await tx.task.findFirstOrThrow({ where: { id: taskId, organizationId: actor.organizationId }, select: taskSelect });
    return taskDto(actor, updated);
  }).catch(rethrowConstructionConflict);
}

export async function archiveTask(actor: AuthorizationContext, taskId: string,
  input: ArchiveTaskInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, task);
    if (!hasPermission(actor, "task:update", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:update", resource);
    if (await tx.taskDependency.count({ where: { organizationId: actor.organizationId, projectId: task.projectId, predecessorTaskId: taskId, successor: { is: { archivedAt: null } } } })) {
      conflict("Remove dependencies from active successor tasks before archiving this prerequisite.");
    }
    const archivedAt = new Date();
    const result = await tx.task.updateMany({ where: { id: taskId, organizationId: actor.organizationId,
      archivedAt: null, updatedAt: new Date(input.expectedUpdatedAt) }, data: { archivedAt } });
    if (result.count !== 1) conflict("Task changed since you opened it. Refresh and retry.");
    await tx.taskAssignment.updateMany({ where: { organizationId: actor.organizationId,
      taskId, unassignedAt: null }, data: { unassignedAt: archivedAt } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId, action: "TASK_ARCHIVED", resourceType: "TASK",
      resourceId: taskId, requestId,
      before: { status: task.status, archivedAt: null },
      after: { archivedAt: archivedAt.toISOString(), reason: input.reason },
    } });
    return { id: taskId, archived: true };
  }).catch(rethrowConstructionConflict);
}

export async function getTaskHistory(actor: AuthorizationContext, taskId: string) {
  await getTask(actor, taskId);
  const rows = await prisma.taskStatusHistory.findMany({ where: {
    organizationId: actor.organizationId, taskId,
  }, select: { fromStatus: true, toStatus: true, note: true, changedAt: true,
    actor: { select: { user: { select: { name: true } } } },
  }, orderBy: { changedAt: "desc" }, take: 50 });
  return { items: rows.map((r) => ({ fromStatus: r.fromStatus, toStatus: r.toStatus,
    note: r.note, changedAt: r.changedAt.toISOString(), by: r.actor.user.name })),
  truncated: rows.length === 50 };
}

function todayInDhaka(): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}

/** Statistics derived from SQL-authorized, filtered tasks, never the current page. */
export async function getTaskSummary(actor: AuthorizationContext, query: TaskListQuery) {
  const where: Prisma.TaskWhereInput = { organizationId: actor.organizationId, archivedAt: null,
    AND: [taskReadScope(actor), taskListFilter(actor, query)],
  };
  const [groups, aggregate, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.task.aggregate({ where, _avg: { progressPercent: true } }),
    prisma.task.count({ where: { AND: [where, { dueOn: { lt: todayInDhaka() },
      status: { not: "COMPLETED" } }] } }),
  ]);
  const counts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return { total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    counts, overdue, averageProgress: Number(aggregate._avg.progressPercent ?? 0) };
}

/** Only task editors may see prerequisite identities or modify the graph. */
export async function listTaskDependencies(actor: AuthorizationContext, taskId: string) {
  const row = await prisma.task.findFirst({ where: { id: taskId, organizationId: actor.organizationId,
    archivedAt: null, AND: [taskReadScope(actor)] }, select: taskSelect });
  if (!row || !hasPermission(actor, "task:update", resourceFor(actor, row))) notFound();
  await assertCurrentWriteAccess(prisma, actor, "task:update", resourceFor(actor, row));
  const items = await prisma.taskDependency.findMany({ where: { organizationId: actor.organizationId,
    projectId: row.projectId, successorTaskId: taskId }, select: { predecessorTaskId: true,
    predecessor: { select: { title: true, status: true, archivedAt: true } } }, orderBy: { createdAt: "asc" } });
  const candidates = await prisma.task.findMany({ where: { organizationId: actor.organizationId,
    projectId: row.projectId, archivedAt: null, id: { not: taskId }, AND: [taskReadScope(actor)] },
    select: { id: true, title: true, status: true }, orderBy: [{ title: "asc" }, { id: "asc" }], take: 101 });
  return { items, candidates: candidates.slice(0, 100), truncated: candidates.length > 100 };
}

export async function changeTaskDependency(actor: AuthorizationContext, taskId: string,
  predecessorId: string, operation: "add" | "remove", requestId: string) {
  return prisma.$transaction(async (tx) => {
    // All task status changes and graph edits acquire the same project lock.
    const row = await lockedTask(tx, actor, taskId);
    const resource = resourceFor(actor, row);
    if (!hasPermission(actor, "task:update", resource)) notFound();
    await assertCurrentWriteAccess(tx, actor, "task:update", resource);
    if (row.status === "COMPLETED") conflict("Completed task dependencies are locked.");
    if (taskId === predecessorId) conflict("A task cannot depend on itself.");
    const where = { organizationId: actor.organizationId, projectId: row.projectId,
      predecessorTaskId: predecessorId, successorTaskId: taskId };
    const existing = await tx.taskDependency.findFirst({ where, select: { id: true } });
    if (operation === "add") {
      const predecessor = await tx.task.findFirst({ where: { id: predecessorId,
        organizationId: actor.organizationId, projectId: row.projectId, archivedAt: null }, select: taskSelect });
      if (!predecessor || !isVisible(actor, predecessor)) notFound();
      if (existing) return { changed: false };
      if (row.status !== "TODO" && predecessor.status !== "COMPLETED") conflict("An active task cannot acquire an incomplete prerequisite.");
      const edges = await tx.taskDependency.findMany({ where: { organizationId: actor.organizationId,
        projectId: row.projectId }, select: { predecessorTaskId: true, successorTaskId: true } });
      if (createsDependencyCycle(edges, predecessorId, taskId)) conflict("Circular task dependency is not allowed.");
      await tx.taskDependency.create({ data: where });
    } else {
      if (!existing) return { changed: false };
      await tx.taskDependency.deleteMany({ where });
    }
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId, action: operation === "add" ? "TASK_DEPENDENCY_ADDED" : "TASK_DEPENDENCY_REMOVED",
      resourceType: "TASK", resourceId: taskId, requestId, after: { predecessorTaskId: predecessorId, operation } } });
    return { changed: true };
  }).catch(rethrowConstructionConflict);
}
