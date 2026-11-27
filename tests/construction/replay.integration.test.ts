import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as dotenv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";
const enabled = process.env.RUN_CONSTRUCTION_REPLAY === "1";
if (enabled) {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Explicit isolated DATABASE_URL required.");
  const u = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !["localhost", "127.0.0.1"].includes(u.hostname) || u.port !== "5433" || u.pathname !== "/buildtrack_auth_test") throw new Error("Unsafe database target.");
  if (dotenv({ path: ".env", override: false }).error) throw new Error("Missing local .env.");
}
describe.skipIf(!enabled)("Step 13E.1 construction replay against isolated PostgreSQL", () => {
  let db: typeof import("@/server/db/client")["prisma"];
  let projects: typeof import("@/server/construction/projects");
  let sites: typeof import("@/server/construction/sites");
  let tasks: typeof import("@/server/construction/tasks");
  let enrollment: typeof import("@/server/construction/enrollment");
  let owner: AuthorizationContext, admin: AuthorizationContext, memberId: string;
  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client"));
    projects = await import("@/server/construction/projects");
    sites = await import("@/server/construction/sites");
    tasks = await import("@/server/construction/tasks");
    enrollment = await import("@/server/construction/enrollment");
    const suffix = randomUUID().slice(0, 12);
    const f = await db.$transaction(async tx => {
      const org = await tx.organization.create({ data: { name: `Replay ${suffix}`, slug: `replay-${suffix}` } });
      const member = async (name: string, role: string) => {
        const user = await tx.user.create({ data: { name, email: `replay-${name}-${suffix}@example.test`, emailVerified: true } });
        return tx.member.create({ data: { organizationId: org.id, userId: user.id, role } });
      };
      const o = await member("owner", "owner"), a = await member("admin", "member"), m = await member("manager", "member");
      await tx.operationalRoleAssignment.create({ data: { organizationId: org.id, membershipId: a.id, role: "ADMIN", scope: "ORGANIZATION", grantedByMembershipId: o.id } });
      return { org: org.id, owner: o.id, admin: a.id, member: m.id };
    });
    owner = { organizationId: f.org, membershipId: f.owner, betterAuthRole: "owner", membershipActive: true, emailVerified: true, grants: [] };
    admin = { ...owner, membershipId: f.admin, betterAuthRole: "member", grants: [{ organizationId: f.org, role: "ADMIN", scope: "organization" }] };
    memberId = f.member;
  }, 60000);
  afterAll(async () => { if (db) await db.$disconnect(); }, 60000);
  it("protects project, site, task and enrollment replays without repeating business mutations", async () => {
    const input = { name: "Replay project", code: `RP-${randomUUID().slice(0, 8).toUpperCase()}`, location: "Dhaka", startDate: "2027-01-01", expectedEndDate: "2027-12-31" };
    const pk = randomUUID();
    const project = await projects.createProject(admin, input, randomUUID(), pk);
    expect((await projects.createProject(admin, input, randomUUID(), pk)).id).toBe(project.id);
    await expect(projects.createProject(owner, input, randomUUID(), pk)).rejects.toMatchObject({ status: 409 });
    const enrollInput = { role: "PROJECT_MANAGER" as const, membershipId: memberId, projectId: project.id };
    const ek = randomUUID();
    const grant = await enrollment.enrollStaff(owner, enrollInput, randomUUID(), ek);
    expect((await enrollment.enrollStaff(owner, enrollInput, randomUUID(), ek)).id).toBe(grant.id);
    const manager: AuthorizationContext = { ...owner, membershipId: memberId, betterAuthRole: "member", grants: [{ organizationId: owner.organizationId, role: "PROJECT_MANAGER", scope: "project", projectId: project.id }] };
    const si = { projectId: project.id, name: "Replay site", location: "Dhaka" }, sk = randomUUID();
    const site = await sites.createSite(manager, si, randomUUID(), sk);
    expect((await sites.createSite(manager, si, randomUUID(), sk)).id).toBe(site.id);
    await expect(sites.createSite(owner, si, randomUUID(), sk)).rejects.toMatchObject({ status: 409 });
    const ti = { projectId: project.id, siteId: site.id, title: "Replay task", priority: "HIGH" as const, dueOn: "2027-06-01" }, tk = randomUUID();
    const task = await tasks.createTask(manager, ti, randomUUID(), tk);
    expect((await tasks.createTask(manager, ti, randomUUID(), tk)).id).toBe(task.id);
    await expect(tasks.createTask(owner, ti, randomUUID(), tk)).rejects.toMatchObject({ status: 409 });
    await enrollment.revokeStaffEnrollment(owner, grant.id, randomUUID());
    await expect(sites.createSite(manager, si, randomUUID(), sk)).rejects.toMatchObject({ status: 403 });
    await expect(tasks.createTask(manager, ti, randomUUID(), tk)).rejects.toMatchObject({ status: 403 });
    await expect(enrollment.enrollStaff(owner, enrollInput, randomUUID(), ek)).rejects.toMatchObject({ status: 409 });
    const revoked = await db.operationalRoleAssignment.updateMany({ where: { organizationId: owner.organizationId, membershipId: admin.membershipId, revokedAt: null }, data: { revokedAt: new Date(), revokedByMembershipId: owner.membershipId } });
    expect(revoked.count).toBe(1);
    await expect(projects.createProject(admin, input, randomUUID(), pk)).rejects.toMatchObject({ status: 403 });
    for (const [resourceId, action] of [[project.id, "PROJECT_CREATED"], [site.id, "SITE_CREATED"], [task.id, "TASK_CREATED"], [grant.id, "construction.staff.enrolled"]]) {
      expect(await db.auditEvent.count({ where: { organizationId: owner.organizationId, resourceId, action } })).toBe(1);
    }
  }, 60000);
});
