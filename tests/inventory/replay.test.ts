import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { ApiError } from "@/server/api/errors";
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: { $transaction: transaction } }));
import { inventoryWrite } from "@/server/inventory/transaction";
const actor: AuthorizationContext = { organizationId: "org", membershipId: "member", membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] };
const payload = { quantity: "1" };
const responseBody = { id: "stock-1" };
const hash = createHash("sha256").update(JSON.stringify({ version: 2, membershipId: actor.membershipId, payload })).digest("hex");
const row = { requestHash: hash, status: "COMPLETED", responseBody };
const tx = { idempotencyRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } };
const invoke = (authorize: () => Promise<void>, action: () => Promise<typeof responseBody>, context = actor) => inventoryWrite(context, "inventory.movement", "key", payload, authorize, action);
beforeEach(() => {
  vi.resetAllMocks();
  tx.idempotencyRecord.findUnique.mockResolvedValue(row);
  transaction.mockImplementation(async (fn) => fn(tx));
});
describe("inventory replay authorization", () => {
  it("checks current authorization without repeating the mutation", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).resolves.toEqual(responseBody);
    expect(authorize).toHaveBeenCalledWith(tx);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects a revoked actor on both replay paths", async () => {
    const authorize = vi.fn().mockRejectedValue(new ApiError(403, "FORBIDDEN", "Revoked"));
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 403 });
    transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 403 });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects other members even if they have permission", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action, { ...actor, membershipId: "other" })).rejects.toMatchObject({ status: 409 });
    expect(action).not.toHaveBeenCalled();
  });
  it("fails closed on legacy fingerprints without rerunning the action", async () => {
    tx.idempotencyRecord.findUnique.mockResolvedValue({ ...row, requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") });
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(vi.fn().mockResolvedValue(undefined), action)).rejects.toMatchObject({ status: 409 });
    expect(action).not.toHaveBeenCalled();
  });
});
