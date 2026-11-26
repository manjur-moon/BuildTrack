import { createHash } from "node:crypto";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";

export type ConstructionTx = Pick<typeof prisma, "project" | "constructionSite" | "auditEvent" | "member" |
  "operationalRoleAssignment" | "projectMember" | "siteAssignment" | "task" | "idempotencyRecord" | "$queryRaw">;

/** Replay a completed create; key reuse with a different payload is a conflict. */
export async function idempotentCreate<T extends object>(
  actor: AuthorizationContext, operation: string, key: string, payload: object,
  create: (tx: ConstructionTx) => Promise<T>,
): Promise<T> {
  const requestHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const where = { organizationId_operation_requestKey: { organizationId: actor.organizationId, operation, requestKey: key } };
  function replay(row: { requestHash: string; status: string; responseBody: unknown } | null): T {
    if (!row || row.status !== "COMPLETED" || !row.responseBody) throw new ApiError(409, "CONFLICT", "Create is being processed. Retry shortly.");
    if (row.requestHash !== requestHash) throw new ApiError(409, "CONFLICT", "Idempotency key cannot be reused for a different request.");
    return row.responseBody as T;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const old = await tx.idempotencyRecord.findUnique({ where });
      if (old) return replay(old);
      await tx.idempotencyRecord.create({ data: {
        organizationId: actor.organizationId, operation, requestKey: key, requestHash,
        status: "PROCESSING", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } });
      const result = await create(tx);
      await tx.idempotencyRecord.update({ where, data: {
        status: "COMPLETED", responseStatus: 201,
        responseBody: JSON.parse(JSON.stringify(result)) as Record<string, string | number | boolean | null>,
        completedAt: new Date(),
      } });
      return result;
    });
  } catch (error) {
    // A competing request may have inserted this key first. Unique-index arbitration
    // waits for the competing transaction to commit before returning P2002.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const committed = await prisma.idempotencyRecord.findUnique({ where });
      if (committed) return replay(committed);
    }
    throw error;
  }
}
