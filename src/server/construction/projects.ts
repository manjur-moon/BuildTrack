import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import type { CreateProjectInput, UpdateProjectInput } from "./input";
import { checkProjectDates } from "./input";
import { assertCurrentWriteAccess } from "./write-access";
import { canCreateProject, canReadProject, projectReadScope } from "./scope";
import { idempotentCreate } from "./idempotency";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const ymd = (value: Date) => value.toISOString().slice(0, 10);
const projectSelect = {
  id: true, organizationId: true, name: true, code: true, description: true,
  location: true, startDate: true, expectedEndDate: true, actualEndDate: true,
  status: true, createdAt: true, updatedAt: true,
} as const;

type ProjectRow = {
  id: string; organizationId: string; name: string; code: string; description: string | null;
  location: string; startDate: Date; expectedEndDate: Date; actualEndDate: Date | null;
  status: string; createdAt: Date; updatedAt: Date;
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

export async function listProjects(actor: AuthorizationContext, page: number, limit: number) {
  const scope = projectReadScope(actor);
  if (!scope.all && scope.projectIds.length === 0) return { items: [], page, limit, total: 0, canCreate: canCreateProject(actor) };
  const where = { organizationId: actor.organizationId, archivedAt: null,
    ...(!scope.all ? { id: { in: scope.projectIds } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({ where, select: projectSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.project.count({ where }),
  ]);
  const items = rows.flatMap((row) => {
    const visibility = canReadProject(actor, { organizationId: row.organizationId, projectId: row.id });
    return visibility ? [projectDto(row, visibility, actor)] : [];
  });
  return { items, page, limit, total, canCreate: canCreateProject(actor) };
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
    return await idempotentCreate(actor, "project.create", key, input, async (tx) => {
      await assertCurrentWriteAccess(tx, actor, "project:create", { organizationId: actor.organizationId });
      const project = await tx.project.create({ data: {
        organizationId: actor.organizationId, name: input.name, code: input.code,
        location: input.location, description: input.description ?? null,
        startDate: date(input.startDate), expectedEndDate: date(input.expectedEndDate),
      }, select: projectSelect });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
        action: "PROJECT_CREATED", resourceType: "PROJECT", resourceId: project.id, requestId,
        after: { name: project.name, code: project.code, status: project.status } } });
      return projectDto(project, "full", actor);
    });
  } catch (error) {
    if (isUnique(error)) throw new ApiError(409, "CONFLICT", "Project code is already used in this organization.");
    throw error;
  }
}

export async function updateProject(actor: AuthorizationContext, id: string, input: UpdateProjectInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
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
  });
}

export async function archiveProject(actor: AuthorizationContext, id: string, expectedUpdatedAt: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const resource = { organizationId: actor.organizationId, projectId: id };
    const existing = await tx.project.findFirst({ where: { id, organizationId: actor.organizationId, archivedAt: null }, select: projectSelect });
    if (!existing || !hasPermission(actor, "project:archive", resource)) throw new ApiError(404, "NOT_FOUND", "Project not found.");
    await assertCurrentWriteAccess(tx, actor, "project:archive", resource);
    const liveSites = await tx.constructionSite.count({ where: { organizationId: actor.organizationId, projectId: id, archivedAt: null } });
    if (liveSites) throw new ApiError(409, "CONFLICT", "Archive all project sites first.");
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
  });
}

export function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
