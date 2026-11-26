import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";

/**
 * Lock protocol for all construction writes: Project first, Site second.
 * Acquiring the parent Project lock before child inserts/archives prevents
 * write skew under PostgreSQL READ COMMITTED (and remains valid under SSI).
 *
 * Table identifiers are constants; dynamic IDs are parameterized by Prisma.
 * Do not use $queryRawUnsafe or interpolate identifiers/SQL fragments.
 */
type ConstructionLockTx = Pick<typeof prisma, "$queryRaw">;

export async function lockProjectRow(
  tx: ConstructionLockTx, organizationId: string, projectId: string,
): Promise<{ id: string; archivedAt: Date | null } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
    SELECT "id", "archivedAt" FROM "Project"
    WHERE "id" = ${projectId} AND "organizationId" = ${organizationId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function requireLiveProjectLock(
  tx: ConstructionLockTx, organizationId: string, projectId: string,
) {
  const row = await lockProjectRow(tx, organizationId, projectId);
  if (!row || row.archivedAt !== null) {
    throw new ApiError(404, "NOT_FOUND", "Active project not found.");
  }
  return row;
}

/** Call only AFTER locking the parent project, to avoid deadlocks. */
export async function lockSiteRow(
  tx: ConstructionLockTx, organizationId: string, projectId: string, siteId: string,
): Promise<{ id: string; archivedAt: Date | null; status: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null; status: string }>>`
    SELECT "id", "archivedAt", "status" FROM "ConstructionSite"
    WHERE "id" = ${siteId} AND "projectId" = ${projectId}
      AND "organizationId" = ${organizationId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/** Translate real database write collisions into API conflicts, never 500s. */
export function rethrowConstructionConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error &&
      error.code === "P2034") {
    throw new ApiError(409, "CONFLICT", "Concurrent construction update. Refresh and retry.");
  }
  throw error;
}
