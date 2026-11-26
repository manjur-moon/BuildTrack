import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as dotenv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";

/**
 * OPT-IN ONLY. Append-only audit rows and fixtures remain in buildtrack_auth_test.
 * This suite must NEVER be pointed at development, staging, or production.
 */
const enabled = process.env.RUN_CONSTRUCTION_HARDENING === "1";
if (enabled) {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to isolated local test DB explicitly.");
  const url = new URL(process.env.DATABASE_URL);
  if (url.pathname !== "/buildtrack_auth_test" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433") {
    throw new Error("Step 8C tests require buildtrack_auth_test on localhost:5433; refusing to run.");
  }
  if (dotenv({ path: ".env", override: false }).error) {
    throw new Error("Local .env not found; other auth env variables are required.");
  }
}

type Db = (typeof import("@/server/db/client"))["prisma"];
type Projects = typeof import("@/server/construction/projects");
type Sites = typeof import("@/server/construction/sites");
type Enrollment = typeof import("@/server/construction/enrollment");

describe.skipIf(!enabled)("Step 8C — isolated PostgreSQL concurrency and revoke safety", () => {
  let db: Db;
  let projects: Projects;
  let sites: Sites;
  let enrollment: Enrollment;
  let orgId: string;
  let ownerId: string;
  let subjectA: string;
  let subjectB: string;
  let foreignOwnerId: string;
  let foreignOrgId: string;

  const actor = (): AuthorizationContext => ({
    organizationId: orgId, membershipId: ownerId,
    membershipActive: true, emailVerified: true, betterAuthRole: "owner", grants: [],
  });
  const req = () => randomUUID();

  async function makeProject() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    return db.project.create({ data: {
      organizationId: orgId, name: `Hardening project ${suffix}`,
      code: `H8-${suffix}`, location: "Dhaka",
      startDate: new Date("2026-11-01T00:00:00.000Z"),
      expectedEndDate: new Date("2027-04-30T00:00:00.000Z"),
    } });
  }
  async function makeSite(projectId: string) {
    return db.constructionSite.create({ data: {
      organizationId: orgId, projectId,
      name: `Site ${randomUUID().slice(0, 8)}`, location: "Dhaka",
    } });
  }
  async function makeTask(projectId: string, assignedMemberId: string, siteId?: string) {
    const task = await db.task.create({ data: {
      organizationId: orgId, projectId, siteId,
      title: "In-progress integration task", dueOn: new Date("2027-03-15T00:00:00Z"),
      createdByMembershipId: ownerId, status: "IN_PROGRESS",
    } });
    await db.taskAssignment.create({ data: {
      organizationId: orgId, projectId, taskId: task.id, membershipId: assignedMemberId,
    } });
    return task;
  }

  beforeAll(async () => {
    ({ prisma: db } = await import("@/server/db/client"));
    projects = await import("@/server/construction/projects");
    sites = await import("@/server/construction/sites");
    enrollment = await import("@/server/construction/enrollment");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const data = await db.$transaction(async (tx) => {
      const orgA = await tx.organization.create({ data: {
        name: `Step8C A ${suffix}`, slug: `step8c-a-${suffix}`,
      } });
      const orgB = await tx.organization.create({ data: {
        name: `Step8C B ${suffix}`, slug: `step8c-b-${suffix}`,
      } });
      const addMember = async (org: string, label: string, role: "owner" | "member") => {
        const user = await tx.user.create({ data: {
          name: label, email: `step8c-${label}-${suffix}@example.test`, emailVerified: true,
        } });
        return tx.member.create({ data: { organizationId: org, userId: user.id, role } });
      };
      const owner = await addMember(orgA.id, "owner-a", "owner");
      const alice = await addMember(orgA.id, "alice", "member");
      const bob = await addMember(orgA.id, "bob", "member");
      const foreignOwner = await addMember(orgB.id, "owner-b", "owner");
      return { orgA: orgA.id, orgB: orgB.id, owner: owner.id,
        alice: alice.id, bob: bob.id, foreignOwner: foreignOwner.id };
    });
    orgId = data.orgA; foreignOrgId = data.orgB;
    ownerId = data.owner; subjectA = data.alice; subjectB = data.bob;
    foreignOwnerId = data.foreignOwner;
  }, 60_000);

  afterAll(async () => {
    // Never delete append-only AuditEvent data or reset the isolated test DB.
    if (db) await db.$disconnect();
  }, 60_000);

  it("serializes project archive against creation of a new live site", async () => {
    const project = await makeProject();
    const results = await Promise.allSettled([
      projects.archiveProject(actor(), project.id, project.updatedAt.toISOString(), req()),
      sites.createSite(actor(), { projectId: project.id,
        name: "Racing Site", location: "Dhaka" }, req(), req()),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const current = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    const liveSites = await db.constructionSite.count({ where: {
      organizationId: orgId, projectId: project.id, archivedAt: null,
    } });
    // Never allow a committed archived project with a committed live site.
    expect(current.archivedAt !== null && liveSites > 0).toBe(false);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  }, 30_000);

  it("concurrent lead PM enrollment commits no more than one manager", async () => {
    const project = await makeProject();
    const results = await Promise.allSettled([
      enrollment.enrollStaff(actor(), { role: "PROJECT_MANAGER",
        projectId: project.id, membershipId: subjectA }, req(), req()),
      enrollment.enrollStaff(actor(), { role: "PROJECT_MANAGER",
        projectId: project.id, membershipId: subjectB }, req(), req()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    const liveGrants = await db.operationalRoleAssignment.findMany({ where: {
      organizationId: orgId, projectId: project.id, role: "PROJECT_MANAGER", revokedAt: null,
    } });
    expect(liveGrants).toHaveLength(1);
    expect(current.managerMembershipId).toBe(liveGrants[0].membershipId);
  }, 30_000);

  it("rejects PM revocation with an unfinished assigned task; succeeds after completion", async () => {
    const project = await makeProject();
    const grant = await enrollment.enrollStaff(actor(), { role: "PROJECT_MANAGER",
      projectId: project.id, membershipId: subjectA }, req(), req());
    const task = await makeTask(project.id, subjectA);
    const blockedRequest = req();
    await expect(enrollment.revokeStaffEnrollment(actor(), grant.id, blockedRequest))
      .rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(await db.operationalRoleAssignment.count({ where: { id: grant.id, revokedAt: null } })).toBe(1);
    expect(await db.taskAssignment.count({ where: {
      organizationId: orgId, taskId: task.id, membershipId: subjectA, unassignedAt: null,
    } })).toBe(1);
    expect(await db.auditEvent.count({ where: { requestId: blockedRequest } })).toBe(0);
    await db.task.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        progressPercent: 100,
        completedAt: new Date(),
      },
    });
    await enrollment.revokeStaffEnrollment(actor(), grant.id, req());
    expect(await db.operationalRoleAssignment.count({ where: { id: grant.id, revokedAt: null } })).toBe(0);
  });

  it("blocks site engineer revocation with unfinished site task; permits reassignment", async () => {
    const project = await makeProject();
    const site = await makeSite(project.id);
    const grant = await enrollment.enrollStaff(actor(), { role: "SITE_ENGINEER",
      siteId: site.id, membershipId: subjectA }, req(), req());
    const task = await makeTask(project.id, subjectA, site.id);
    await expect(enrollment.revokeStaffEnrollment(actor(), grant.id, req()))
      .rejects.toMatchObject({ status: 409 });
    await db.taskAssignment.updateMany({ where: {
      organizationId: orgId, taskId: task.id, membershipId: subjectA, unassignedAt: null,
    }, data: { unassignedAt: new Date() } });
    await enrollment.revokeStaffEnrollment(actor(), grant.id, req());
    expect(await db.siteAssignment.count({ where: {
      organizationId: orgId, siteId: site.id, membershipId: subjectA, endedAt: null,
    } })).toBe(0);
  });

  it("cannot archive or close a site while active staff are assigned", async () => {
    const project = await makeProject();
    const site = await makeSite(project.id);
    const grant = await enrollment.enrollStaff(actor(), { role: "SITE_ENGINEER",
      siteId: site.id, membershipId: subjectB }, req(), req());
    const refreshed = await db.constructionSite.findUniqueOrThrow({ where: { id: site.id } });
    await expect(sites.archiveSite(actor(), site.id, refreshed.updatedAt.toISOString(), req()))
      .rejects.toMatchObject({ status: 409 });
    await expect(sites.updateSite(actor(), site.id, { expectedUpdatedAt: refreshed.updatedAt.toISOString(),
      status: "CLOSED" }, req())).rejects.toMatchObject({ status: 409 });
    await enrollment.revokeStaffEnrollment(actor(), grant.id, req());
    const after = await db.constructionSite.findUniqueOrThrow({ where: { id: site.id } });
    await sites.archiveSite(actor(), site.id, after.updatedAt.toISOString(), req());
    expect((await db.constructionSite.findUniqueOrThrow({ where: { id: site.id } })).archivedAt).not.toBeNull();
  });

  it("site archive and engineer enrollment cannot both leave an archived-but-assigned site", async () => {
    const project = await makeProject();
    const site = await makeSite(project.id);
    const results = await Promise.allSettled([
      sites.archiveSite(actor(), site.id, site.updatedAt.toISOString(), req()),
      enrollment.enrollStaff(actor(), { role: "SITE_ENGINEER",
        siteId: site.id, membershipId: subjectB }, req(), req()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await db.constructionSite.findUniqueOrThrow({ where: { id: site.id } });
    const active = await db.siteAssignment.count({ where: {
      organizationId: orgId, siteId: site.id, endedAt: null,
    } });
    expect(current.archivedAt !== null && active > 0).toBe(false);
  }, 30_000);

  it("simultaneous PM revoke and replacement never creates two live PM grants", async () => {
    const project = await makeProject();
    const first = await enrollment.enrollStaff(actor(), { role: "PROJECT_MANAGER",
      projectId: project.id, membershipId: subjectA }, req(), req());
    await Promise.allSettled([
      enrollment.revokeStaffEnrollment(actor(), first.id, req()),
      enrollment.enrollStaff(actor(), { role: "PROJECT_MANAGER",
        projectId: project.id, membershipId: subjectB }, req(), req()),
    ]);
    const current = await db.project.findUniqueOrThrow({ where: { id: project.id } });
    const active = await db.operationalRoleAssignment.findMany({ where: {
      organizationId: orgId, projectId: project.id, role: "PROJECT_MANAGER", revokedAt: null,
    } });
    expect(active.length).toBeLessThanOrEqual(1);
    expect(current.managerMembershipId).toBe(active[0]?.membershipId ?? null);
  }, 30_000);

  it("still denies cross-tenant mutations", async () => {
    const project = await makeProject();
    const outsider: AuthorizationContext = { ...actor(), organizationId: foreignOrgId,
      membershipId: foreignOwnerId };
    await expect(sites.createSite(outsider, { projectId: project.id, name: "Cross-tenant",
      location: "Dhaka" }, req(), req())).rejects.toMatchObject({ status: 404 });
    expect(await db.constructionSite.count({ where: { projectId: project.id } })).toBe(0);
  });
});
