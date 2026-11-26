import { createHash } from "node:crypto";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthorizationContext } from "@/server/rbac/policy";

export type Tx = Prisma.TransactionClient;

function replay<T>(row: { requestHash: string; status: string; responseBody: unknown } | null,
  hash: string): T {
  if (!row) throw new ApiError(409, "CONFLICT", "Request is still processing.");
  if (row.requestHash !== hash) throw new ApiError(409, "CONFLICT", "Idempotency key reused with different input.");
  if (row.status !== "COMPLETED" || !row.responseBody) throw new ApiError(409, "CONFLICT", "Request has not completed.");
  return row.responseBody as T;
}

/** Business write, audit event, and replay record commit in a single transaction. */
export async function inventoryWrite<T extends object>(actor: AuthorizationContext, operation: string,
  key: string, payload: object, action: (tx: Tx) => Promise<T>): Promise<T> {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const where = { organizationId_operation_requestKey: {
    organizationId: actor.organizationId, operation, requestKey: key,
  } };
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.idempotencyRecord.findUnique({ where });
      if (previous) return replay<T>(previous, hash);
      await tx.idempotencyRecord.create({ data: {
        organizationId: actor.organizationId, operation, requestKey: key, requestHash: hash,
        status: "PROCESSING", expiresAt: new Date(Date.now() + 86400000),
      } });
      const result = await action(tx);
      await tx.idempotencyRecord.update({ where, data: {
        status: "COMPLETED", responseStatus: 201,
        responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        completedAt: new Date(),
      } });
      return result;
    }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") {
        const existing = await prisma.idempotencyRecord.findUnique({ where });
        if (existing) return replay<T>(existing, hash);
        throw new ApiError(409, "CONFLICT", "Duplicate material or stock record.");
      }
      if (error.code === "P2034") throw new ApiError(409, "CONFLICT", "Concurrent stock update. Retry with the same request key.");
    }
    throw error;
  }
}
export async function audit(tx: Tx, actor: AuthorizationContext, requestId: string,
  action: string, resourceType: string, resourceId: string, after: Record<string, unknown>, before?: Record<string, unknown>) {
  await tx.auditEvent.create({ data: {
    organizationId: actor.organizationId, actorMembershipId: actor.membershipId,
    requestId, action, resourceType, resourceId,
    after: after as Prisma.InputJsonValue,
    ...(before ? { before: before as Prisma.InputJsonValue } : {}),
  } });
}
