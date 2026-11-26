import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadDotEnv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";

/**
 * EXPLICIT OPT-IN only. AuditEvent, StockMovement and MaterialUsageRecord are append-only.
 * Fixtures deliberately remain in buildtrack_auth_test; never run against buildtrack_dev.
 */
const enabled = process.env.RUN_INVENTORY_INTEGRATION === "1";
if (enabled) {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Explicit DATABASE_URL for buildtrack_auth_test is required.");
  const target = new URL(raw);
  if (!(["localhost", "127.0.0.1"].includes(target.hostname) &&
      target.port === "5433" && target.pathname === "/buildtrack_auth_test")) {
    throw new Error("Refusing to run inventory integration tests outside local buildtrack_auth_test:5433.");
  }
  if (loadDotEnv({ path: ".env", override: false }).error) throw new Error("Missing .env for server-side app config.");
}
type Db = typeof import("@/server/db/client")["prisma"];
type Cat = typeof import("@/server/inventory/catalog");
type Stock = typeof import("@/server/inventory/stock");
type Req = typeof import("@/server/inventory/requisitions");
type Use = typeof import("@/server/inventory/usage");

describe.skipIf(!enabled)("Step 12 — isolated PostgreSQL stock ledger, approvals and concurrency", () => {
  let db: Db; let catalog: Cat; let stock: Stock; let requests: Req; let usage: Use;
  let orgId: string, otherOrgId: string, ownerId: string, engineerId: string, managerId: string, outsideId: string;
  let projectId: string, siteId: string, materialId: string, categoryId: string;
  const uuid = () => randomUUID();
  const actor = (membershipId: string, role: string, grant?: AuthorizationContext["grants"][number]): AuthorizationContext => ({
    organizationId: orgId, membershipId, betterAuthRole: role, membershipActive: true,
    emailVerified: true, grants: grant ? [grant] : [],
  });
  const owner = () => actor(ownerId, "owner");
  const engineer = () => actor(engineerId, "member", { role: "SITE_ENGINEER", scope: "site", organizationId: orgId, projectId, siteId });
  const manager = () => actor(managerId, "member", { role: "PROJECT_MANAGER", scope: "project", organizationId: orgId, projectId });
  const foreign = (): AuthorizationContext => ({ organizationId: otherOrgId, membershipId: outsideId,
    membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] });
  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client"));
    catalog = await import("@/server/inventory/catalog");
    stock = await import("@/server/inventory/stock");
    requests = await import("@/server/inventory/requisitions");
    usage = await import("@/server/inventory/usage");
    const suffix = uuid().replaceAll("-", "").slice(0, 12);
    const f = await db.$transaction(async (tx) => {
      const a = await tx.organization.create({ data: { name: "Stock test A", slug: `stock-a-${suffix}` } });
      const b = await tx.organization.create({ data: { name: "Stock test B", slug: `stock-b-${suffix}` } });
      const member = async (organizationId: string, name: string, role: string) => {
        const user = await tx.user.create({ data: { name, email: `stock-${name}-${suffix}@example.test`, emailVerified: true } });
        return tx.member.create({ data: { organizationId, userId: user.id, role } });
      };
      const own = await member(a.id, "owner", "owner");
      const eng = await member(a.id, "engineer", "member");
      const mgr = await member(a.id, "manager", "member");
      const ext = await member(b.id, "outside", "owner");
      const p = await tx.project.create({ data: { organizationId: a.id, name: "Inventory Project", code: `STOCK-${suffix}`,
        location: "Dhaka", startDate: new Date("2027-01-01T00:00:00Z"), expectedEndDate: new Date("2027-12-31T00:00:00Z") } });
      const s = await tx.constructionSite.create({ data: { organizationId: a.id, projectId: p.id,
        name: "Materials Yard", location: "Dhaka" } });
      await tx.projectMember.create({ data: { organizationId: a.id, projectId: p.id, membershipId: eng.id } });
      await tx.projectMember.create({ data: { organizationId: a.id, projectId: p.id, membershipId: mgr.id } });
      await tx.siteAssignment.create({ data: { organizationId: a.id, projectId: p.id, siteId: s.id, membershipId: eng.id } });
      await tx.operationalRoleAssignment.create({ data: { organizationId: a.id, projectId: p.id, siteId: s.id,
        membershipId: eng.id, grantedByMembershipId: own.id, role: "SITE_ENGINEER", scope: "SITE" } });
      await tx.operationalRoleAssignment.create({ data: { organizationId: a.id, projectId: p.id,
        membershipId: mgr.id, grantedByMembershipId: own.id, role: "PROJECT_MANAGER", scope: "PROJECT" } });
      return { org: a.id, other: b.id, owner: own.id, engineer: eng.id, manager: mgr.id, outside: ext.id, project: p.id, site: s.id };
    });
    orgId = f.org; otherOrgId = f.other; ownerId = f.owner; engineerId = f.engineer; managerId = f.manager;
    outsideId = f.outside; projectId = f.project; siteId = f.site;
  }, 60_000);
  afterAll(async () => { if (db) await db.$disconnect(); }, 60_000);

  it("creates a tenant-scoped catalog with replay-safe keys", async () => {
    const cat = await catalog.createCategory(owner(), { name: "Structural materials" }, uuid(), uuid());
    categoryId = cat.id;
    const input = { name: "Portland cement", sku: `CEM-${uuid().slice(0, 8)}`.toUpperCase(), categoryId, unit: "BAG" as const };
    const key = uuid();
    const m = await catalog.createMaterial(owner(), input, key, uuid());
    const replay = await catalog.createMaterial(owner(), input, key, uuid());
    materialId = m.id;
    expect(replay.id).toBe(m.id);
    expect(await db.material.count({ where: { organizationId: orgId, id: m.id } })).toBe(1);
    await expect(stock.listStock(foreign(), siteId, 1, 10)).rejects.toMatchObject({ status: 404 });
  });
  it("writes stock receipts atomically; rejects overdrafts and duplicate replay", async () => {
    const body = { siteId, materialId, quantity: "20.000", type: "RECEIPT" as const,
      reason: "Received twenty bags for first pour" };
    const key = uuid();
    const first = await stock.recordMovement(engineer(), body, key, uuid());
    const second = await stock.recordMovement(engineer(), body, key, uuid());
    expect(second.id).toBe(first.id);
    await expect(stock.recordMovement(owner(), { ...body, type: "ADJUSTMENT_OUT", quantity: "25.000" }, uuid(), uuid())).rejects.toMatchObject({ status: 409 });
    const current = await stock.listStock(owner(), siteId, 1, 20);
    expect(current.items.find((r) => r.materialId === materialId)?.onHand).toBe("20");
    expect(await db.stockMovement.count({ where: { organizationId: orgId, inventory: { is: { siteId, materialId } } } })).toBe(1);
  });
  it("enforces maker-checker approval and partial material issue", async () => {
    const submitted = await requests.createRequest(engineer(), { projectId, siteId,
      reason: "For ground-floor column casting", items: [{ materialId, quantity: "12.000" }] }, uuid(), uuid());
    expect(submitted.status).toBe("PENDING");
    await expect(requests.decideRequest(engineer(), submitted.id,
      { decision: "APPROVE", lines: [{ itemId: submitted.items[0].id, quantityApproved: "10" }] }, uuid(), uuid())).rejects.toMatchObject({ status: 404 });
    const approved = await requests.decideRequest(manager(), submitted.id,
      { decision: "APPROVE", lines: [{ itemId: submitted.items[0].id, quantityApproved: "10" }] }, uuid(), uuid());
    expect(approved.status).toBe("APPROVED");
    const first = await requests.issueRequest(engineer(), submitted.id,
      { lines: [{ requestItemId: submitted.items[0].id, quantity: "6.000" }] }, uuid(), uuid());
    expect(first.status).toBe("PARTIALLY_FULFILLED");
    const done = await requests.issueRequest(engineer(), submitted.id,
      { lines: [{ requestItemId: submitted.items[0].id, quantity: "4.000" }] }, uuid(), uuid());
    expect(done.status).toBe("FULFILLED");
    const current = await stock.listStock(owner(), siteId, 1, 20);
    expect(current.items.find((r) => r.materialId === materialId)?.onHand).toBe("10");
    await expect(requests.issueRequest(engineer(), submitted.id,
      { lines: [{ requestItemId: submitted.items[0].id, quantity: "1" }] }, uuid(), uuid())).rejects.toMatchObject({ status: 409 });
  });
  it("consumption records evidence without reducing site stock twice; returns unconsumed units", async () => {
    const issued = await usage.listIssuedItems(owner(), siteId, 1, 20);
    const line = issued.items.find((x) => x.materialName === "Portland cement" && x.issued === "6.000");
    expect(line).toBeDefined();
    const recorded = await usage.consumeIssued(engineer(), line!.id, { quantity: "2.000", note: "Used in cast" }, uuid(), uuid());
    expect(recorded.consumedTotal).toBe("2.000");
    await expect(usage.returnIssued(engineer(), line!.id,
      { quantity: "5.000", reason: "Remaining dry bags returned" }, uuid(), uuid())).rejects.toMatchObject({ status: 409 });
    await usage.returnIssued(engineer(), line!.id,
      { quantity: "3.000", reason: "Remaining dry bags returned" }, uuid(), uuid());
    const current = await stock.listStock(owner(), siteId, 1, 20);
    expect(current.items.find((r) => r.materialId === materialId)?.onHand).toBe("13");
    expect(await db.materialUsageRecord.count({ where: { organizationId: orgId, issueItemId: line!.id } })).toBe(1);
  });
  it("concurrent competing issues cannot exceed approved balance or negative stock", async () => {
    const submitted = await requests.createRequest(engineer(), { projectId, siteId,
      reason: "Overlapping requisition issue test", items: [{ materialId, quantity: "10" }] }, uuid(), uuid());
    await requests.decideRequest(manager(), submitted.id, { decision: "APPROVE",
      lines: [{ itemId: submitted.items[0].id, quantityApproved: "10" }] }, uuid(), uuid());
    const attempts = await Promise.allSettled([
      requests.issueRequest(engineer(), submitted.id, { lines: [{ requestItemId: submitted.items[0].id, quantity: "7" }] }, uuid(), uuid()),
      requests.issueRequest(engineer(), submitted.id, { lines: [{ requestItemId: submitted.items[0].id, quantity: "7" }] }, uuid(), uuid()),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const items = await db.materialIssueItem.findMany({ where: { organizationId: orgId, requestItemId: submitted.items[0].id } });
    expect(items.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(7);
    const inv = await db.siteInventory.findUniqueOrThrow({ where: { organizationId_siteId_materialId: {
      organizationId: orgId, siteId, materialId,
    } } });
    expect(Number(inv.onHand)).toBeGreaterThanOrEqual(0);
  }, 30_000);
  it("prevents cross-tenant stock writes and does not append an audit record", async () => {
    const requestId = uuid();
    await expect(stock.recordMovement(foreign(), { siteId, materialId, quantity: "1", type: "RECEIPT",
      reason: "Cross org attempt blocked" }, uuid(), requestId)).rejects.toMatchObject({ status: 404 });
    expect(await db.auditEvent.count({ where: { requestId } })).toBe(0);
  });
  it("rejects cached stock responses for different actors and revoked grants", async () => {
    const body = { siteId, materialId, quantity: "1.000", type: "RECEIPT" as const,
      reason: "Replay authorization regression" };
    const key = uuid();
    const first = await stock.recordMovement(engineer(), body, key, uuid());
    const auditBefore = await db.auditEvent.count({ where: { organizationId: orgId } });
    expect((await stock.recordMovement(engineer(), body, key, uuid())).id).toBe(first.id);
    await expect(stock.recordMovement(manager(), body, key, uuid())).rejects.toMatchObject({ status: 409 });
    await expect(stock.recordMovement({ ...engineer(), grants: [] }, body, key, uuid())).rejects.toMatchObject({ status: 404 });
    await db.operationalRoleAssignment.updateMany({ where: { organizationId: orgId,
      membershipId: engineerId, role: "SITE_ENGINEER", revokedAt: null }, data: { revokedAt: new Date(), revokedByMembershipId: ownerId } });
    await expect(stock.recordMovement(engineer(), body, key, uuid())).rejects.toMatchObject({ status: 403 });
    expect(await db.stockMovement.count({ where: { organizationId: orgId, idempotencyKey: key } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: orgId } })).toBe(auditBefore);
  });

});
