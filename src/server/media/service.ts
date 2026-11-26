import { ApiError } from "@/server/api/errors";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { hasPermission, type AuthorizationContext, type Permission, type Resource } from "@/server/rbac/policy";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { lockSiteRow, requireLiveProjectLock, rethrowConstructionConflict } from "@/server/construction/locking";
import { MAX_IMAGE_BYTES, mediaPublicDTO, type InitMedia, type ListMediaQuery } from "./input";
import { deleteStoredObject, presignStagingUpload, readyKey, sanitizeAndPublish, signedPrivateView, temporaryKey } from "./storage";

const select = {
  id: true, organizationId: true, projectId: true, siteId: true, objectKey: true,
  originalName: true, mimeType: true, byteSize: true, status: true,
  createdAt: true, deletedAt: true, uploadedByMembershipId: true,
} as const;

type MediaRow = NonNullable<Awaited<ReturnType<typeof findMedia>>>;

async function findMedia(actor: AuthorizationContext, id: string) {
  return prisma.fileAttachment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, select });
}

async function requireMediaResource(actor: AuthorizationContext, kind: "PROJECT" | "SITE", id: string, permission: "read" | "write") {
  const organizationId = actor.organizationId;
  if (kind === "PROJECT") {
    const project = await prisma.project.findFirst({ where: { id, organizationId, archivedAt: null }, select: { id: true } });
    const resource: Resource = { organizationId, projectId: id };
    const required: Permission = permission === "read" ? "project:view" : "project:update";
    if (!project || !hasPermission(actor, required, resource)) throw new ApiError(404, "NOT_FOUND", "Media resource not found.");
    return { projectId: project.id, siteId: null as string | null, resource, required };
  }
  const site = await prisma.constructionSite.findFirst({ where: {
    id, organizationId, archivedAt: null, project: { is: { archivedAt: null } },
  }, select: { id: true, projectId: true } });
  if (!site) throw new ApiError(404, "NOT_FOUND", "Media resource not found.");
  const resource: Resource = { organizationId, projectId: site.projectId, siteId: site.id };
  const required: Permission = permission === "read" ? "site:view" : "site:update";
  if (!hasPermission(actor, required, resource)) throw new ApiError(404, "NOT_FOUND", "Media resource not found.");
  return { projectId: site.projectId, siteId: site.id, resource, required };
}

async function authorizeExistingMedia(actor: AuthorizationContext, row: MediaRow, permission: "read" | "write") {
  const kind = row.siteId ? "SITE" : "PROJECT";
  const resource = await requireMediaResource(actor, kind, row.siteId ?? row.projectId ?? "", permission);
  if (row.projectId !== resource.projectId) throw new ApiError(404, "NOT_FOUND", "Media not found.");
  return resource;
}

function mayDelete(actor: AuthorizationContext, row: MediaRow): boolean {
  const resource: Resource = { organizationId: actor.organizationId, projectId: row.projectId ?? "", ...(row.siteId ? { siteId: row.siteId } : {}) };
  const canWrite = hasPermission(actor, row.siteId ? "site:update" : "project:update", resource);
  return canWrite && (actor.membershipId === row.uploadedByMembershipId || hasPermission(actor, "project:update", resource));
}

async function lockResourceForMutation(tx: Prisma.TransactionClient, actor: AuthorizationContext,
  projectId: string, siteId: string | null, required: Permission, resource: Resource) {
  await requireLiveProjectLock(tx, actor.organizationId, projectId);
  if (siteId) {
    const live = await lockSiteRow(tx, actor.organizationId, projectId, siteId);
    if (!live || live.archivedAt !== null || live.status === "CLOSED") throw new ApiError(409, "CONFLICT", "Site is closed or archived.");
  }
  await assertCurrentWriteAccess(tx, actor, required, resource);
}

export async function initiateMediaUpload(actor: AuthorizationContext, input: InitMedia, requestId: string) {
  const related = await requireMediaResource(actor, input.kind, input.resourceId, "write");
  const id = crypto.randomUUID();
  const key = temporaryKey(actor.organizationId, id);
  const row = await prisma.$transaction(async (tx) => {
    await lockResourceForMutation(tx, actor, related.projectId, related.siteId, related.required, related.resource);
    const recent = await tx.fileAttachment.count({ where: {
      organizationId: actor.organizationId, uploadedByMembershipId: actor.membershipId,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    } });
    if (recent >= 30) throw new ApiError(429, "RATE_LIMITED", "Hourly photo upload limit reached.");
    const item = await tx.fileAttachment.create({ data: {
      id, organizationId: actor.organizationId, projectId: related.projectId,
      siteId: related.siteId, uploadedByMembershipId: actor.membershipId,
      originalName: input.fileName, mimeType: input.mimeType,
      byteSize: BigInt(input.byteSize), status: "PENDING", objectKey: key,
    }, select: { id: true } });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "MEDIA_UPLOAD_INITIATED", resourceType: "FILE_ATTACHMENT", resourceId: id, requestId,
      after: { kind: input.kind, projectId: related.projectId, siteId: related.siteId, bytes: input.byteSize },
    } });
    return item;
  }).catch(rethrowConstructionConflict);
  // Signing after commit avoids holding a SQL row lock while contacting storage.
  // A temporary PENDING row is harmless if storage is unavailable; clean it via a retention job.
  const signed = await presignStagingUpload(key, input.mimeType);
  return { id: row.id, ...signed, maxBytes: MAX_IMAGE_BYTES };
}

export async function completeMediaUpload(actor: AuthorizationContext, id: string, requestId: string) {
  const pending = await findMedia(actor, id);
  if (!pending || pending.uploadedByMembershipId !== actor.membershipId) throw new ApiError(404, "NOT_FOUND", "Media upload not found.");
  if (pending.status === "READY") {
    await authorizeExistingMedia(actor, pending, "read");
    return mediaPublicDTO(pending, mayDelete(actor, pending));
  }
  if (pending.status !== "PENDING") throw new ApiError(409, "CONFLICT", "Media upload is not pending.");
  const scope = await authorizeExistingMedia(actor, pending, "write");
  if (Date.now() - pending.createdAt.getTime() > 15 * 60 * 1000) {
    throw new ApiError(409, "CONFLICT", "Upload session expired. Start a new upload.");
  }
  const finalKey = readyKey(actor.organizationId, pending.id);
  const output = await sanitizeAndPublish(pending.objectKey, finalKey, pending.mimeType as InitMedia["mimeType"], Number(pending.byteSize));
  const updated = await prisma.$transaction(async (tx) => {
    await lockResourceForMutation(tx, actor, scope.projectId, scope.siteId, scope.required, scope.resource);
    const result = await tx.fileAttachment.updateMany({ where: { id, organizationId: actor.organizationId,
      uploadedByMembershipId: actor.membershipId, status: "PENDING", deletedAt: null, objectKey: pending.objectKey,
    }, data: { status: "READY", objectKey: finalKey, mimeType: "image/webp", byteSize: BigInt(output.bytes) } });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Upload was already completed or changed.");
    const item = await tx.fileAttachment.findFirstOrThrow({ where: { id, organizationId: actor.organizationId }, select });
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "MEDIA_UPLOAD_COMPLETED", resourceType: "FILE_ATTACHMENT", resourceId: id, requestId,
      after: { projectId: item.projectId, siteId: item.siteId, bytes: output.bytes, mimeType: "image/webp" },
    } });
    return item;
  }).catch(rethrowConstructionConflict);
  try { await deleteStoredObject(pending.objectKey); }
  catch { console.error(JSON.stringify({ level: "warn", event: "media_quarantine_cleanup_failed", mediaId: id })); }
  return mediaPublicDTO(updated, mayDelete(actor, updated));
}

export async function listMedia(actor: AuthorizationContext, query: ListMediaQuery) {
  const scope = await requireMediaResource(actor, query.kind, query.resourceId, "read");
  const where = { organizationId: actor.organizationId, projectId: scope.projectId,
    siteId: scope.siteId, status: "READY" as const, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.fileAttachment.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.fileAttachment.count({ where }),
  ]);
  return { items: rows.map((row) => mediaPublicDTO(row, mayDelete(actor, row))), total,
    page: query.page, limit: query.limit, totalPages: Math.max(1, Math.ceil(total / query.limit)),
    canUpload: hasPermission(actor, query.kind === "PROJECT" ? "project:update" : "site:update", scope.resource),
  };
}

export async function getPrivateMediaUrl(actor: AuthorizationContext, id: string) {
  const row = await findMedia(actor, id);
  if (!row || row.status !== "READY") throw new ApiError(404, "NOT_FOUND", "Media not found.");
  await authorizeExistingMedia(actor, row, "read");
  return signedPrivateView(row.objectKey);
}

export async function deleteMedia(actor: AuthorizationContext, id: string, requestId: string) {
  const row = await findMedia(actor, id);
  if (!row || row.status !== "READY") throw new ApiError(404, "NOT_FOUND", "Media not found.");
  await authorizeExistingMedia(actor, row, "read");
  if (!mayDelete(actor, row)) throw new ApiError(404, "NOT_FOUND", "Media not found.");
  const scope = await authorizeExistingMedia(actor, row, "write");
  const updated = await prisma.$transaction(async (tx) => {
    await lockResourceForMutation(tx, actor, scope.projectId, scope.siteId, scope.required, scope.resource);
    const result = await tx.fileAttachment.updateMany({ where: { id, organizationId: actor.organizationId, status: "READY", deletedAt: null },
      data: { status: "DELETED", deletedAt: new Date() } });
    if (result.count !== 1) throw new ApiError(409, "CONFLICT", "Media already deleted.");
    await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
      action: "MEDIA_DELETED", resourceType: "FILE_ATTACHMENT", resourceId: id, requestId,
      before: { projectId: row.projectId, siteId: row.siteId, mimeType: row.mimeType },
      after: { deleted: true },
    } });
    return true;
  }).catch(rethrowConstructionConflict);
  if (updated) {
    try { await deleteStoredObject(row.objectKey); }
    catch { console.error(JSON.stringify({ level: "warn", event: "media_object_cleanup_failed", mediaId: id })); }
  }
  return { id, deleted: true };
}
