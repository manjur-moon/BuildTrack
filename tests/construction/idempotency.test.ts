import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { ApiError } from "@/server/api/errors";
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: { $transaction: transaction } }));
import { idempotentCreate } from "@/server/construction/idempotency";
const actor: AuthorizationContext = { organizationId: "org-a", membershipId: "member-a", membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] };
const payload = { title: "Foundation" };
const responseBody = { id: "resource-a" };
const hash = createHash("sha256").update(JSON.stringify({ version: 2, membershipId: actor.membershipId, payload })).digest("hex");
const row = { requestHash: hash, status: "COMPLETED", responseBody };
const tx = { member: { findFirst: vi.fn() }, idempotencyRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } };
const invoke = (authorize: () => Promise<void>, action: () => Promise<typeof responseBody>, context = actor) => idempotentCreate(context, "task.create", "same-key", payload, authorize, action);
beforeEach(() => {
  vi.resetAllMocks();
  tx.member.findFirst.mockResolvedValue({ id: actor.membershipId });
  tx.idempotencyRecord.findUnique.mockResolvedValue(row);
  transaction.mockImplementation(async (fn) => fn(tx));
});
describe("construction replay authorization", () => {
  it("replays without repeating a mutation after checking live membership and resource permission", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).resolves.toEqual(responseBody);
    expect(authorize).toHaveBeenCalledWith(tx, responseBody.id);
    expect(action).not.toHaveBeenCalled();
    expect(tx.idempotencyRecord.update).not.toHaveBeenCalled();
  });
  it("checks current resource permission on both normal and P2002 recovery paths", async () => {
    const authorize = vi.fn().mockRejectedValue(new ApiError(403, "FORBIDDEN", "Revoked"));
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 403 });
    transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 403 });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects a different member and a legacy hash without running the action", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action, { ...actor, membershipId: "other" })).rejects.toMatchObject({ status: 409 });
    tx.idempotencyRecord.findUnique.mockResolvedValue({ ...row, requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") });
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 409 });
    expect(action).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
  it("rejects disabled or unverified membership before exposing a cached body", async () => {
    tx.member.findFirst.mockResolvedValue(null);
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).rejects.toMatchObject({ status: 403 });
    expect(tx.member.findFirst).toHaveBeenCalledWith({ where: { id: actor.membershipId, organizationId: actor.organizationId, disabledAt: null, user: { is: { emailVerified: true } } }, select: { id: true } });
    expect(authorize).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
  it("creates exactly once with the new fingerprint for a new request", async () => {
    tx.idempotencyRecord.findUnique.mockResolvedValue(null);
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).resolves.toEqual(responseBody);
    expect(action).toHaveBeenCalledTimes(1);
    expect(authorize).not.toHaveBeenCalled();
    expect(tx.idempotencyRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestHash: hash, status: "PROCESSING" }) }));
    expect(tx.idempotencyRecord.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", responseBody }) }));
  });
  it("preserves unrelated unique-index errors if no committed replay record exists", async () => {
    const error = { code: "P2002" };
    transaction.mockRejectedValueOnce(error);
    tx.idempotencyRecord.findUnique.mockResolvedValue(null);
    const authorize = vi.fn().mockResolvedValue(undefined);
    const action = vi.fn().mockResolvedValue(responseBody);
    await expect(invoke(authorize, action)).rejects.toEqual(error);
    expect(authorize).not.toHaveBeenCalled();
  });
});
