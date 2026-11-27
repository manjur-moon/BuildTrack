import { createHash } from "node:crypto";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";

export type ConstructionTx = Pick<typeof prisma, "project" | "constructionSite" | "auditEvent" | "member" |
  "operationalRoleAssignment" | "projectMember" | "siteAssignment" | "task" | "idempotencyRecord" | "$queryRaw">;

/** Replay a completed create; key reuse with a different payload is a conflict. */
export async function idempotentCreate<T extends object>(
  actor: AuthorizationContext, operation: string, key: string, payload: object,
  authorizeReplay: (tx: ConstructionTx, resourceId: string) => Promise<void>,
  create: (tx: ConstructionTx) => Promise<T>,
): Promise<T> {
  const requestHash = createHash("sha256").update(JSON.stringify({ version: 2, membershipId: actor.membershipId, payload })).digest("hex");
  const where = { organizationId_operation_requestKey: { organizationId: actor.organizationId, operation, requestKey: key } };
  async function replay(tx: ConstructionTx, row: { requestHash: string; status: string; responseBody: unknown } | null): Promise<T> {
    if (!row || row.status !== "COMPLETED" || !row.responseBody) throw new ApiError(409, "CONFLICT", "Create is being processed. Retry shortly.");
    if (row.requestHash !== requestHash) throw new ApiError(409, "CONFLICT", "Idempotency key cannot be reused for a different request.");
    // A response is scoped to its original member, not just the organization.
    const member = await tx.member.findFirst({ where: {
      id: actor.membershipId, organizationId: actor.organizationId, disabledAt: null,
      user: { is: { emailVerified: true } },
    }, select: { id: true } });
    if (!actor.membershipActive || !actor.emailVerified || !member) {
      throw new ApiError(403, "FORBIDDEN", "Membership is no longer active or verified.");
    }
    const body = row.responseBody;
    if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
      throw new ApiError(409, "CONFLICT", "Stored response cannot be replayed safely.");
    }
    await authorizeReplay(tx, body.id);
    return body as T;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const old = await tx.idempotencyRecord.findUnique({ where });
      if (old) return replay(tx, old);
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
      return prisma.$transaction(async (tx) => {
        const committed = await tx.idempotencyRecord.findUnique({ where });
        if (!committed) throw error;
        return replay(tx, committed);
      });
    }
    throw error;
  }
}
