import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import type { CreateProjectInput, UpdateProjectInput } from "./input";
import { checkProjectDates } from "./input";
import { assertCurrentWriteAccess } from "./write-access";
import { canCreateProject, canReadProject, projectReadScope } from "./scope";
import { idempotentCreate } from "./idempotency";
import type { ProjectListQuery } from "./list-query";
import { projectListFilter, projectListOrder, listMeta } from "./list-query";
import type { Prisma } from "@/generated/prisma/client";
import { requireLiveProjectLock, rethrowConstructionConflict } from "./locking";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ymd = (value: Date) => value.toISOString().slice(0, 10);
const projectSelect = {
  id: true, organizationId: true, name: true, code: true, description: true,
  location: true, startDate: true, expectedEndDate: true, actualEndDate: true,
  managerMembershipId: true, status: true, createdAt: true, updatedAt: true,
} as const;

type ProjectRow = {
  id: string; organizationId: string; name: string; code: string; description: string | null;
  location: string; startDate: Date; expectedEndDate: Date; actualEndDate: Date | null;
  managerMembershipId: string | null; status: string; createdAt: Date; updatedAt: Date;
};

function projectDto(row: NonNullable<ProjectRow>, visibility: "full" | "summary", actor: AuthorizationContext) {
  const summary = { id: row.id, name: row.name, code: row.code, status: row.status,
    visibility, canEdit: visibility === "full" && hasPermission(actor, "project:update", {
      organizationId: row.organizationId, projectId: row.id }),
    canArchive: hasPermission(actor, "project:archive", { organizationId: row.organizationId, projectId: row.id }),
  };
  if (visibility === "summary") return summary;
  return { ...summary, description: row.description, location: row.location,
    startDate: ymd(row.startDate), expectedEndDate: ymd(row.expectedEndDate),
    actualEndDate: row.actualEndDate ? ymd(row.actualEndDate) : null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProjects(actor: AuthorizationContext, query: ProjectListQuery) {
  const { page, limit } = query;
  const scope = projectReadScope(actor);
  if (!scope.all && scope.projectIds.length === 0) {
    return { items: [], ...listMeta(page, limit, 0), canCreate: canCreateProject(actor), canUsePrivateProjectFilters: false };
  }
  // Summary-only actors must not learn hidden project dates through filter counts or sort order.
  const canUsePrivateProjectFilters = scope.all
    ? hasPermission(actor, "project:view", { organizationId: actor.organizationId, projectId: "__list_project_scope_probe__" })
    : scope.projectIds.every((projectId) => hasPermission(actor, "project:view", {
      organizationId: actor.organizationId, projectId,
    }));
  if (!canUsePrivateProjectFilters && (query.from || query.to ||
      query.sortBy === "startDate" || query.sortBy === "expectedEndDate")) {
    throw new ApiError(403, "FORBIDDEN", "Project date filters and date sorting require full project access.");
  }
  // Both authorization and tenant predicates are applied in SQL BEFORE skip/take/count.
  // Summary-only actors can search project name/code, not restricted location/description.
  const where: Prisma.ProjectWhereInput = {
    organizationId: actor.organizationId, archivedAt: null,
    ...(!scope.all ? { id: { in: scope.projectIds } } : {}),
    ...projectListFilter(query),
  };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({ where, select: projectSelect, orderBy: projectListOrder(query), skip: (page - 1) * limit, take: limit }),
    prisma.project.count({ where }),
  ]);
  const items = rows.flatMap((row) => {
    const visibility = canReadProject(actor, { organizationId: row.organizationId, projectId: row.id });
    return visibility ? [projectDto(row, visibility, actor)] : [];
  });
  return { items, ...listMeta(page, limit, total), canCreate: canCreateProject(actor), canUsePrivateProjectFilters };
}

export async function getProject(actor: AuthorizationContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: actor.organizationId, archivedAt: null }, select: projectSelect,
  });
  const visibility = project && canReadProject(actor, { organizationId: actor.organizationId, projectId });
  if (!project || !visibility) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return projectDto(project, visibility, actor);
}

export async function createProject(actor: AuthorizationContext, input: CreateProjectInput, requestId: string, key: string) {
  if (!canCreateProject(actor)) throw new ApiError(403, "FORBIDDEN", "Cannot create projects.");
  try {
    return await idempotentCreate(actor, "project.create", key, input, async (tx, id) => {
      await requireLiveProjectLock(tx, actor.organizationId, id);
      await assertCurrentWriteAccess(tx, actor, "project:create", { organizationId: actor.organizationId });
    }, async (tx) => {
      await assertCurrentWriteAccess(tx, actor, "project:create", { organizationId: actor.organizationId });
      const project = await tx.project.create({ data: {
        organizationId: actor.organizationId, name: input.name, code: input.code,
        location: input.location, description: input.description ?? null,
        startDate: date(input.startDate), expectedEndDate: date(input.expectedEndDate),
      }, select: projectSelect });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
        action: "PROJECT_CREATED", resourceType: "PROJECT", resourceId: project.id, requestId,
        after: { name: project.name, code: project.code, status: project.status } } });
      if (input.initialBudget !== undefined) {
        await assertCurrentWriteAccess(tx, actor, "expense:manage", { organizationId: actor.organizationId, projectId: project.id });
        const budget = await tx.projectBudget.create({ data: { organizationId: actor.organizationId, projectId: project.id,
          initialAmount: input.initialBudget, approvedAmount: input.initialBudget, currency: "BDT" } });
        await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
          action: "BUDGET_CREATED", resourceType: "PROJECT_BUDGET", resourceId: budget.id, requestId,
          after: { amount: budget.approvedAmount.toFixed(2), reason: "Initial project budget" } } });
      }
      return projectDto(project, "full", actor);
    });
  } catch (error) {
    if (isUnique(error)) throw new ApiError(409, "CONFLICT", "Project code is already used in this organization.");
    throw error;
  }
}

export async function updateProject(actor: AuthorizationContext, id: string, input: UpdateProjectInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
    // Serializes status changes with site creation and staff assignments.
    await requireLiveProjectLock(tx, actor.organizationId, id);
    const existing = await tx.project.findFirst({ where: { id, organizationId: actor.organizationId, archivedAt: null }, select: projectSelect });
    const resource = { organizationId: actor.organizationId, projectId: id };
    if (!existing || !hasPermission(actor, "project:update", resource)) throw new ApiError(404, "NOT_FOUND", "Project not found.");
    await assertCurrentWriteAccess(tx, actor, "project:update", resource);
    const startDate = input.startDate ?? ymd(existing.startDate);
    const expectedEndDate = input.expectedEndDate ?? ymd(existing.expectedEndDate);
    const actualEndDate = input.actualEndDate === undefined ? (existing.actualEndDate ? ymd(existing.actualEndDate) : null) : input.actualEndDate;
    const status = input.status ?? existing.status;
    const dateError = checkProjectDates(startDate, expectedEndDate, actualEndDate, status);
    if (dateError) throw new ApiError(422, "VALIDATION_ERROR", dateError);
    if (status === "COMPLETED") {
      const incomplete = await tx.task.count({ where: { organizationId: actor.organizationId,
        projectId: id, archivedAt: null, status: { not: "COMPLETED" } } });
      if (incomplete) throw new ApiError(409, "CONFLICT", "Complete all open project tasks before marking it complete.");
    }
    const result = await tx.project.updateMany({
      where: { id, organizationId: actor.organizationId, archivedAt: null, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.startDate !== undefined ? { startDate: date(input.startDate) } : {}),
        ...(input.expectedEndDate !== undefined ? { expectedEndDate: date(input.expectedEndDate) } : {}),
        ...(input.actualEndDate !== undefined ? { actualEndDate: input.actualEndDate ? date(input.actualEndDate) : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Project changed since you opened it. Refresh and retry.");
    const updated = await tx.project.findFirstOrThrow({ where: { id, organizationId: actor.organizationId }, select: projectSelect });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "PROJECT_UPDATED", resourceType: "PROJECT", resourceId: id, requestId,
      before: { name: existing.name, code: existing.code, status: existing.status },
      after: { name: updated.name, code: updated.code, status: updated.status } } });
    return projectDto(updated, "full", actor);
  }).catch(rethrowConstructionConflict);
}

export async function archiveProject(actor: AuthorizationContext, id: string, expectedUpdatedAt: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    // Site creators must take this SAME parent lock before inserting a child.
    await requireLiveProjectLock(tx, actor.organizationId, id);
    const resource = { organizationId: actor.organizationId, projectId: id };
    const existing = await tx.project.findFirst({ where: { id, organizationId: actor.organizationId, archivedAt: null }, select: projectSelect });
    if (!existing || !hasPermission(actor, "project:archive", resource)) throw new ApiError(404, "NOT_FOUND", "Project not found.");
    await assertCurrentWriteAccess(tx, actor, "project:archive", resource);
    const liveSites = await tx.constructionSite.count({ where: { organizationId: actor.organizationId, projectId: id, archivedAt: null } });
    if (liveSites) throw new ApiError(409, "CONFLICT", "Archive all project sites first.");
    if (existing.managerMembershipId) throw new ApiError(409, "CONFLICT", "Revoke the lead project manager before archiving.");
    const openTasks = await tx.task.count({ where: { organizationId: actor.organizationId,
      projectId: id, archivedAt: null, status: { not: "COMPLETED" } } });
    if (openTasks) throw new ApiError(409, "CONFLICT", "Complete or archive all open project tasks first.");
    const result = await tx.project.updateMany({ where: { id, organizationId: actor.organizationId,
      archivedAt: null, updatedAt: new Date(expectedUpdatedAt) }, data: { archivedAt: new Date() } });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Project changed. Refresh and retry.");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "PROJECT_ARCHIVED", resourceType: "PROJECT", resourceId: id, requestId,
      before: { status: existing.status, archivedAt: null }, after: { archivedAt: new Date().toISOString() } } });
    return { id, archived: true };
  }).catch(rethrowConstructionConflict);
}

export function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

