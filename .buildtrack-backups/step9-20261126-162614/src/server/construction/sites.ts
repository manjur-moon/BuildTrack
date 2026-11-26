import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import type { CreateSiteInput, UpdateSiteInput } from "./input";
import { assertCurrentWriteAccess } from "./write-access";
import { canCreateSite, siteReadScope } from "./scope";
import { idempotentCreate } from "./idempotency";
import { requireLiveProjectLock, lockSiteRow, rethrowConstructionConflict } from "./locking";

const siteSelect = { id: true, organizationId: true, projectId: true, name: true, location: true,
  status: true, createdAt: true, updatedAt: true } as const;
type SiteRow = { id: string; organizationId: string; projectId: string; name: string;
  location: string; status: string; createdAt: Date; updatedAt: Date };

function dto(row: SiteRow, actor: AuthorizationContext) {
  const resource = { organizationId: row.organizationId, projectId: row.projectId, siteId: row.id };
  return { id: row.id, projectId: row.projectId, name: row.name, location: row.location,
    status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    canEdit: hasPermission(actor, "site:update", resource),
    canEditDetails: hasPermission(actor, "project:update", resource),
    canArchive: hasPermission(actor, "project:archive", resource),
  };
}

export async function listSites(actor: AuthorizationContext, page: number, limit: number) {
  const scope = siteReadScope(actor);
  if (!scope.all && !scope.siteIds.length && !scope.projectIds.length) return { items: [], page, limit, total: 0 };
  const where = { organizationId: actor.organizationId, archivedAt: null,
    project: { is: { archivedAt: null } },
    ...(!scope.all ? { OR: [
      ...(scope.projectIds.length ? [{ projectId: { in: scope.projectIds } }] : []),
      ...(scope.siteIds.length ? [{ id: { in: scope.siteIds } }] : []),
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.constructionSite.findMany({ where, select: siteSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.constructionSite.count({ where }),
  ]);
  return { items: rows.filter((row) => hasPermission(actor, "site:view", {
    organizationId: row.organizationId, projectId: row.projectId, siteId: row.id,
  })).map((row) => dto(row, actor)), page, limit, total };
}

export async function getSite(actor: AuthorizationContext, siteId: string) {
  const row = await prisma.constructionSite.findFirst({ where: { id: siteId,
    organizationId: actor.organizationId, archivedAt: null, project: { is: { archivedAt: null } } }, select: siteSelect });
  if (!row || !hasPermission(actor, "site:view", { organizationId: actor.organizationId, projectId: row.projectId, siteId })) {
    throw new ApiError(404, "NOT_FOUND", "Site not found.");
  }
  return dto(row, actor);
}

export async function createSite(actor: AuthorizationContext, input: CreateSiteInput, requestId: string, key: string) {
  const resource = { organizationId: actor.organizationId, projectId: input.projectId };
  if (!canCreateSite(actor, input.projectId)) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return idempotentCreate(actor, "site.create", key, input, async (tx) => {
    // Parent lock prevents a simultaneous archive from passing its live-site check.
    await requireLiveProjectLock(tx, actor.organizationId, input.projectId);
    const project = await tx.project.findFirst({ where: { id: input.projectId, organizationId: actor.organizationId, archivedAt: null }, select: { id: true } });
    if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found.");
    await assertCurrentWriteAccess(tx, actor, "project:update", resource);
    const row = await tx.constructionSite.create({ data: { organizationId: actor.organizationId,
      projectId: input.projectId, name: input.name, location: input.location }, select: siteSelect });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "SITE_CREATED", resourceType: "CONSTRUCTION_SITE", resourceId: row.id, requestId,
      after: { projectId: row.projectId, name: row.name, status: row.status } } });
    return dto(row, actor);
  }).catch(rethrowConstructionConflict);
}

export async function updateSite(actor: AuthorizationContext, siteId: string, input: UpdateSiteInput, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.constructionSite.findFirst({ where: { id: siteId, organizationId: actor.organizationId,
      archivedAt: null, project: { is: { archivedAt: null } } }, select: siteSelect });
    if (!row) throw new ApiError(404, "NOT_FOUND", "Site not found.");
    // Always acquire parent then child lock; re-read live state after waiting.
    await requireLiveProjectLock(tx, actor.organizationId, row.projectId);
    const siteLock = await lockSiteRow(tx, actor.organizationId, row.projectId, siteId);
    if (!siteLock || siteLock.archivedAt !== null) {
      throw new ApiError(404, "NOT_FOUND", "Site not found.");
    }
    const resource = { organizationId: actor.organizationId, projectId: row.projectId, siteId };
    if (!hasPermission(actor, "site:update", resource)) throw new ApiError(404, "NOT_FOUND", "Site not found.");
    await assertCurrentWriteAccess(tx, actor, "site:update", resource);
    if ((input.name !== undefined || input.location !== undefined) &&
        !hasPermission(actor, "project:update", resource)) {
      throw new ApiError(403, "FORBIDDEN", "Only a project manager or admin can edit site identity or location.");
    }
    if ((input.name !== undefined || input.location !== undefined) &&
        hasPermission(actor, "project:update", resource)) {
      await assertCurrentWriteAccess(tx, actor, "project:update", resource);
    }
    if (input.status === "CLOSED") {
      const assignedStaff = await tx.siteAssignment.count({ where: {
        organizationId: actor.organizationId, projectId: row.projectId, siteId, endedAt: null,
      } });
      if (assignedStaff) throw new ApiError(409, "CONFLICT", "Revoke active site staff before closing the site.");
      const unfinished = await tx.task.count({ where: { organizationId: actor.organizationId,
        siteId, archivedAt: null, status: { not: "COMPLETED" } } });
      if (unfinished) throw new ApiError(409, "CONFLICT", "Complete or reassign open site tasks before closing the site.");
    }
    const result = await tx.constructionSite.updateMany({ where: { id: siteId,
      organizationId: actor.organizationId, archivedAt: null, updatedAt: new Date(input.expectedUpdatedAt) },
      data: { ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}) },
    });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Site changed. Refresh and retry.");
    const updated = await tx.constructionSite.findFirstOrThrow({ where: { id: siteId, organizationId: actor.organizationId }, select: siteSelect });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "SITE_UPDATED", resourceType: "CONSTRUCTION_SITE", resourceId: siteId, requestId,
      before: { name: row.name, status: row.status }, after: { name: updated.name, status: updated.status } } });
    return dto(updated, actor);
  }).catch(rethrowConstructionConflict);
}

export async function archiveSite(actor: AuthorizationContext, siteId: string, expectedUpdatedAt: string, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.constructionSite.findFirst({ where: { id: siteId, organizationId: actor.organizationId,
      archivedAt: null, project: { is: { archivedAt: null } } }, select: siteSelect });
    if (!row) throw new ApiError(404, "NOT_FOUND", "Site not found.");
    // Always acquire parent then child lock; re-read live state after waiting.
    await requireLiveProjectLock(tx, actor.organizationId, row.projectId);
    const siteLock = await lockSiteRow(tx, actor.organizationId, row.projectId, siteId);
    if (!siteLock || siteLock.archivedAt !== null) {
      throw new ApiError(404, "NOT_FOUND", "Site not found.");
    }
    const resource = { organizationId: actor.organizationId, projectId: row.projectId, siteId };
    if (!hasPermission(actor, "project:archive", resource)) throw new ApiError(404, "NOT_FOUND", "Site not found.");
    await assertCurrentWriteAccess(tx, actor, "project:archive", resource);
    const activeStaff = await tx.siteAssignment.count({ where: {
      organizationId: actor.organizationId, projectId: row.projectId, siteId, endedAt: null,
    } });
    if (activeStaff) throw new ApiError(409, "CONFLICT", "Revoke active site staff before archiving the site.");
    const unfinished = await tx.task.count({ where: { organizationId: actor.organizationId, siteId, archivedAt: null,
      status: { not: "COMPLETED" } } });
    if (unfinished) throw new ApiError(409, "CONFLICT", "Complete or reassign open site tasks first.");
    const result = await tx.constructionSite.updateMany({ where: { id: siteId, organizationId: actor.organizationId,
      archivedAt: null, updatedAt: new Date(expectedUpdatedAt) }, data: { archivedAt: new Date() } });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Site changed. Refresh and retry.");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "SITE_ARCHIVED", resourceType: "CONSTRUCTION_SITE", resourceId: siteId, requestId,
      before: { name: row.name, archivedAt: null }, after: { archivedAt: new Date().toISOString() } } });
    return { id: siteId, archived: true };
  }).catch(rethrowConstructionConflict);
}
