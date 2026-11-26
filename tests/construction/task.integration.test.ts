import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";

/** Opt-in integration: append-only audit fixtures remain in buildtrack_auth_test. */
const enabled = process.env.RUN_TASK_INTEGRATION === "1";
if (enabled) {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Explicit DATABASE_URL for buildtrack_auth_test is required.");
  const url = new URL(raw);
  if (!(["localhost", "127.0.0.1"].includes(url.hostname) &&
       url.port === "5433" && url.pathname === "/buildtrack_auth_test")) {
    throw new Error("Refusing to run outside buildtrack_auth_test on localhost:5433.");
  }
  if (loadEnv({ path: ".env", override: false }).error) throw new Error("Missing .env for server-side auth configuration.");
}
type Db = typeof import("@/server/db/client")["prisma"];
type Tasks = typeof import("@/server/construction/tasks");

describe.skipIf(!enabled)("Step 11 — isolated PostgreSQL task integrity and RBAC", () => {
  let db: Db; let svc: Tasks; let orgId: string; let foreignOrg: string; let ownerId: string; let foreignOwnerId: string;
  let projectId: string; let siteId: string;
  const req = () => randomUUID();
  const actor = (): AuthorizationContext => ({ organizationId: orgId, membershipId: ownerId,
    membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] });
  const outsider = (): AuthorizationContext => ({ organizationId: foreignOrg, membershipId: foreignOwnerId,
    membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [] });
  const payload = () => ({ projectId, siteId, title: "Complete safety inspection",
    startsOn: "2027-02-01", dueOn: "2027-03-01", priority: "HIGH" as const });
  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client"));
    svc = await import("@/server/construction/tasks");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const data = await db.$transaction(async (tx) => {
      const a = await tx.organization.create({ data: { name: `Tasks A ${suffix}`, slug: `tasks-a-${suffix}` } });
      const b = await tx.organization.create({ data: { name: `Tasks B ${suffix}`, slug: `tasks-b-${suffix}` } });
      const ua = await tx.user.create({ data: { name: "Step11 Owner A", email: `task-a-${suffix}@example.test`, emailVerified: true } });
      const ub = await tx.user.create({ data: { name: "Step11 Owner B", email: `task-b-${suffix}@example.test`, emailVerified: true } });
      const ma = await tx.member.create({ data: { organizationId: a.id, userId: ua.id, role: "owner" } });
      const mb = await tx.member.create({ data: { organizationId: b.id, userId: ub.id, role: "owner" } });
      const project = await tx.project.create({ data: { organizationId: a.id, name: "Task Project", code: `TASK-${suffix}`,
        location: "Dhaka", startDate: new Date("2027-01-01T00:00:00Z"), expectedEndDate: new Date("2027-06-01T00:00:00Z") } });
      const site = await tx.constructionSite.create({ data: { organizationId: a.id, projectId: project.id, name: "Site A", location: "Dhaka" } });
      return { a: a.id, b: b.id, ma: ma.id, mb: mb.id, project: project.id, site: site.id };
    });
    orgId = data.a; foreignOrg = data.b; ownerId = data.ma; foreignOwnerId = data.mb;
    projectId = data.project; siteId = data.site;
  }, 60_000);
  afterAll(async () => { if (db) await db.$disconnect(); }, 60_000);

  it("creates an audited, organization-scoped task and prevents cross-tenant read", async () => {
    const created = await svc.createTask(actor(), payload(), req(), req());
    expect(created.status).toBe("TODO"); expect(created.progressPercent).toBe(0);
    await expect(svc.getTask(outsider(), created.id)).rejects.toMatchObject({ status: 404 });
    const audit = await db.auditEvent.count({ where: { organizationId: orgId, resourceId: created.id, action: "TASK_CREATED" } });
    expect(audit).toBe(1);
  });
  it("enforces sequential workflow, status history and completed=100", async () => {
    const t = await svc.createTask(actor(), payload(), req(), req());
    await expect(svc.updateTaskProgress(actor(), t.id, { expectedUpdatedAt: t.updatedAt,
      status: "COMPLETED", progressPercent: 100 }, req())).rejects.toMatchObject({ status: 422 });
    const a = await svc.updateTaskProgress(actor(), t.id, { expectedUpdatedAt: t.updatedAt,
      status: "IN_PROGRESS", progressPercent: 20 }, req());
    const b = await svc.updateTaskProgress(actor(), t.id, { expectedUpdatedAt: a.updatedAt,
      status: "REVIEW", progressPercent: 95, note: "Ready for sign-off" }, req());
    const c = await svc.updateTaskProgress(actor(), t.id, { expectedUpdatedAt: b.updatedAt,
      status: "COMPLETED", progressPercent: 100 }, req());
    expect(c.progressPercent).toBe(100); expect(c.completedAt).not.toBeNull();
    const history = await svc.getTaskHistory(actor(), t.id);
    expect(history.items).toHaveLength(3);
  });
  it("rejects unauthorized cross-tenant writes without an audit row", async () => {
    const t = await svc.createTask(actor(), payload(), req(), req());
    const requestId = req();
    await expect(svc.archiveTask(outsider(), t.id, { expectedUpdatedAt: t.updatedAt,
      reason: "Foreign org must not archive" }, requestId)).rejects.toMatchObject({ status: 404 });
    expect(await db.auditEvent.count({ where: { requestId } })).toBe(0);
  });
  it("serializes project archive against task creation", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const p = await db.project.create({ data: { organizationId: orgId, name: "Race Project",
      code: `RACE-${suffix}`, location: "Dhaka", startDate: new Date("2027-01-01T00:00:00Z"),
      expectedEndDate: new Date("2027-06-01T00:00:00Z") } });
    const { archiveProject } = await import("@/server/construction/projects");
    const attempts = await Promise.allSettled([
      archiveProject(actor(), p.id, p.updatedAt.toISOString(), req()),
      svc.createTask(actor(), { ...payload(), projectId: p.id, siteId: null }, req(), req()),
    ]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const [project, liveTaskCount] = await Promise.all([
      db.project.findUniqueOrThrow({ where: { id: p.id } }),
      db.task.count({ where: { organizationId: orgId, projectId: p.id, archivedAt: null } }),
    ]);
    expect(project.archivedAt !== null && liveTaskCount > 0).toBe(false);
  }, 30_000);
});
