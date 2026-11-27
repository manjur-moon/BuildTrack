import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled = process.env.RUN_NOTIFICATION_INTEGRATION === "1";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.port !== "5433" || u.pathname !== "/buildtrack_auth_test") throw Error("Unsafe notifications test database");
  if (config({ path: ".env", override: false }).error) throw Error("Missing .env");
}
describe.skipIf(!enabled)("Step 13D.3 isolated notification and audit boundaries", () => {
  let db: typeof import("@/server/db/client")["prisma"];
  let service: typeof import("@/server/notifications/service");
  let owner: AuthorizationContext, manager: AuthorizationContext, foreign: AuthorizationContext;
  let otherTaskId: string, projectId: string;
  const now = new Date("2027-02-05T09:00:00Z");
  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client")); service = await import("@/server/notifications/service");
    const suffix = randomUUID().slice(0,12);
    await db.$transaction(async tx => {
      const a = await tx.organization.create({ data: { name: "Alert test", slug: `alerts-${suffix}` } });
      const b = await tx.organization.create({ data: { name: "Other alert test", slug: `alerts-other-${suffix}` } });
      async function member(organizationId: string, name: string, role: string) {
        const user = await tx.user.create({ data: { name, email: `alerts-${name}-${suffix}@example.test`, emailVerified: true } });
        return tx.member.create({ data: { organizationId, userId: user.id, role } });
      }
      const o = await member(a.id, "owner", "owner"), m = await member(a.id, "manager", "member"), f = await member(b.id, "foreign", "owner");
      owner = { organizationId: a.id, membershipId: o.id, membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] };
      foreign = { ...owner, organizationId: b.id, membershipId: f.id };
      const p = await tx.project.create({ data: { organizationId: a.id, name: "Assigned project", code: "A", location: "Dhaka", startDate: new Date("2027-01-01"), expectedEndDate: new Date("2027-12-31"), status: "ACTIVE" } });
      const q = await tx.project.create({ data: { organizationId: a.id, name: "Other project", code: "B", location: "Dhaka", startDate: new Date("2027-01-01"), expectedEndDate: new Date("2027-01-31"), status: "ACTIVE" } });
      projectId = p.id;
      await tx.projectMember.create({ data: { organizationId: a.id, projectId: p.id, membershipId: m.id } });
      await tx.operationalRoleAssignment.create({ data: { organizationId: a.id, projectId: p.id, membershipId: m.id, grantedByMembershipId: o.id, role: "PROJECT_MANAGER", scope: "PROJECT" } });
      manager = { ...owner, membershipId: m.id, betterAuthRole: "member", grants: [{ organizationId: a.id, projectId: p.id, role: "PROJECT_MANAGER", scope: "project" }] };
      const task = await tx.task.create({ data: { organizationId: a.id, projectId: p.id, title: "Assigned confidential task", dueOn: new Date("2027-12-01"), createdByMembershipId: o.id } });
      await tx.taskAssignment.create({ data: { organizationId: a.id, projectId: p.id, taskId: task.id, membershipId: m.id, assignedAt: now } });
      otherTaskId = (await tx.task.create({ data: { organizationId: a.id, projectId: q.id, title: "Unassigned late task", dueOn: new Date("2027-01-20"), createdByMembershipId: o.id } })).id;
      const category = await tx.expenseCategory.create({ data: { organizationId: a.id, name: "Alerts expense" } });
      await tx.projectBudget.create({ data: { organizationId: a.id, projectId: p.id, initialAmount: "100", approvedAmount: "100", currency: "BDT" } });
      await tx.expense.create({ data: { organizationId: a.id, projectId: p.id, categoryId: category.id, title: "Posted", amount: "100.01", expenseDate: new Date("2027-02-01"), recordedByMembershipId: o.id, status: "POSTED", postedAt: now } });
      await tx.projectBudget.create({ data: { organizationId: a.id, projectId: q.id, initialAmount: "100", approvedAmount: "100", currency: "BDT" } });
      await tx.expense.create({ data: { organizationId: a.id, projectId: q.id, categoryId: category.id, title: "Draft", amount: "1000", expenseDate: new Date("2027-02-01"), recordedByMembershipId: o.id } });
      const site = await tx.constructionSite.create({ data: { organizationId: a.id, projectId: q.id, name: "Other yard", location: "Dhaka", status: "ACTIVE" } });
      const materialCategory = await tx.materialCategory.create({ data: { organizationId: a.id, name: "Alerts materials" } });
      const material = await tx.material.create({ data: { organizationId: a.id, categoryId: materialCategory.id, name: "Cement", sku: "ALERT-CEMENT", unit: "BAG" } });
      await tx.siteInventory.create({ data: { organizationId: a.id, siteId: site.id, materialId: material.id, onHand: "0", reorderLevel: "3" } });
      const request = await tx.materialRequest.create({ data: { organizationId: a.id, projectId: q.id, siteId: site.id, requestedByMembershipId: o.id, reason: "Fixture request" } });
      await tx.materialRequestItem.createMany({ data: [{ organizationId: a.id, requestId: request.id, materialId: material.id, quantityRequested: "3" }] });
      await tx.dailyProgressReport.create({ data: { organizationId: a.id, projectId: q.id, siteId: site.id, reportedByMembershipId: o.id, workDate: new Date("2027-02-05"), workDescription: "Historical report fixture", submittedAt: now } });
      await tx.auditEvent.create({ data: { organizationId: a.id, actorMembershipId: o.id, action: "TEST_ALERT", resourceType: "Project", resourceId: p.id, after: { secret: "private snapshot" }, ipAddress: "127.0.0.1" } });
      await tx.auditEvent.create({ data: { organizationId: b.id, actorMembershipId: f.id, action: "TEST_ALERT", resourceType: "Project", resourceId: "foreign" } });
    });
  }, 60000);
  afterAll(async () => { if (db) await db.$disconnect(); });
  it("deduplicates alerts, scopes them to recipients and supports idempotent read state", async () => {
    const results = await Promise.all([service.mutateNotifications(manager, { action: "refresh" }, now), service.mutateNotifications(manager, { action: "refresh" }, now)]);
    expect(results.reduce((n, r) => n + r.changed, 0)).toBe(2);
    const inbox = await service.listNotifications(manager, { page: 1, filter: "all" });
    expect(inbox.items.map(r => r.type).sort()).toEqual(["BUDGET_OVERRUN", "TASK_ASSIGNED"]); expect(inbox.unread).toBe(2);
    expect(JSON.stringify(inbox)).not.toContain("Assigned confidential task"); expect(JSON.stringify(inbox)).not.toContain(otherTaskId);
    expect((await service.listNotifications(foreign, { page: 1, filter: "all" })).total).toBe(0);
    await expect(service.mutateNotifications(owner, { action: "set-read", id: inbox.items[0].id, read: true })).rejects.toMatchObject({ status: 404 });
    await expect(service.mutateNotifications(foreign, { action: "set-read", id: inbox.items[0].id, read: true })).rejects.toMatchObject({ status: 404 });
    expect((await service.mutateNotifications(manager, { action: "set-read", id: inbox.items[0].id, read: true })).changed).toBe(1);
    expect((await service.mutateNotifications(manager, { action: "set-read", id: inbox.items[0].id, read: true })).changed).toBe(0);
    expect((await service.listNotifications(manager, { page: 1, filter: "unread" })).total).toBe(1);
    await service.mutateNotifications(manager, { action: "set-read", id: inbox.items[0].id, read: false });
    expect((await service.mutateNotifications(manager, { action: "read-all" })).changed).toBe(2);
    expect((await service.mutateNotifications(manager, { action: "refresh" }, now)).changed).toBe(0);
    expect((await service.listNotifications(manager, { page: 1, filter: "read" })).total).toBe(2);
    await db.operationalRoleAssignment.updateMany({ where: { organizationId: manager.organizationId, membershipId: manager.membershipId, projectId, revokedAt: null }, data: { revokedAt: new Date(), revokedByMembershipId: owner.membershipId } });
    const fresh = { ...manager, grants: [] };
    expect((await service.listNotifications(fresh, { page: 1, filter: "all" })).total).toBe(0);
  }, 60000);
  it("creates owner alerts for real operational conditions and isolates foreign organizations", async () => {
    expect((await service.mutateNotifications(owner, { action: "refresh" }, now)).changed).toBe(6);
    const list = await service.listNotifications(owner, { page: 1, filter: "all" });
    expect(list.items.map(r => r.type).sort()).toEqual(["BUDGET_OVERRUN", "LOW_STOCK", "MATERIAL_REQUEST", "PROJECT_DELAYED", "REPORT_SUBMITTED", "TASK_OVERDUE"]);
    expect((await service.mutateNotifications(foreign, { action: "refresh" }, now)).changed).toBe(0);
    expect((await service.listNotifications(foreign, { page: 1, filter: "all" })).total).toBe(0);
  }, 60000);
  it("restricts audit to authorized administrators and redacts snapshots", async () => {
    await expect(service.listActivity(manager, { page: 1, q: "TEST_ALERT" })).rejects.toMatchObject({ status: 403 });
    const log = await service.listActivity(owner, { page: 1, q: "TEST_ALERT" });
    expect(log.total).toBe(1); expect(log.items[0]).toMatchObject({ action: "TEST_ALERT", actorName: "owner" });
    expect(JSON.stringify(log)).not.toContain("private snapshot"); expect(JSON.stringify(log)).not.toContain("127.0.0.1");
    const other = await service.listActivity(foreign, { page: 1, q: "TEST_ALERT" });
    expect(other.total).toBe(1); expect(other.items[0].id).not.toBe(log.items[0].id);
  }, 60000);
});
