import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadDotEnv } from "dotenv";
import type { AuthorizationContext } from "@/server/rbac/policy";

/** Opt-in: never run against buildtrack_dev or a cloud database. */
const run = process.env.RUN_STAFF_INTEGRATION === "1";
if (run) {
  const selected = process.env.DATABASE_URL;
  if (!selected) throw new Error("Explicit test DATABASE_URL is required.");
  const target = new URL(selected);
  if (target.pathname !== "/buildtrack_auth_test" ||
      !["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433") {
    throw new Error("Staff integration is permitted only on buildtrack_auth_test at localhost:5433.");
  }
  const env = loadDotEnv({ path: ".env", override: false });
  if (env.error) throw new Error("Missing local .env; Better Auth configuration required.");
}

type Db = (typeof import("@/server/db/client"))["prisma"];
type EnrollmentService = typeof import("@/server/construction/enrollment");

type Fixture = { orgA: string; orgB: string; ownerA: string; ownerB: string;
  subject: string; second: string; foreignSubject: string; project: string; site: string; archivedSite: string };

describe.skipIf(!run)("Step 8 staff enrollment — isolated PostgreSQL security", () => {
  let prisma: Db;
  let service: EnrollmentService;
  let f: Fixture;
  let projectGrantId: string;
  let siteGrantId: string;
  let pmRequestKey: string;

  const owner = (): AuthorizationContext => ({ organizationId: f.orgA,
    membershipId: f.ownerA, membershipActive: true, emailVerified: true,
    betterAuthRole: "owner", grants: [] });
  const foreignOwner = (): AuthorizationContext => ({ ...owner(), organizationId: f.orgB, membershipId: f.ownerB });
  const member = (): AuthorizationContext => ({ ...owner(), membershipId: f.subject, betterAuthRole: "member" });

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/client"));
    service = await import("@/server/construction/enrollment");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 15);
    f = await prisma.$transaction(async (tx) => {
      const a = await tx.organization.create({ data: { name: `Enroll A ${suffix}`, slug: `enroll-a-${suffix}` } });
      const b = await tx.organization.create({ data: { name: `Enroll B ${suffix}`, slug: `enroll-b-${suffix}` } });
      const makeMember = async (orgId: string, name: string, role: string) => {
        const user = await tx.user.create({ data: {
          name, email: `staff-${name.toLowerCase()}-${suffix}@example.test`, emailVerified: true,
        } });
        return tx.member.create({ data: { organizationId: orgId, userId: user.id, role } });
      };
      const ownerA = await makeMember(a.id, "OwnerA", "owner");
      const ownerB = await makeMember(b.id, "OwnerB", "owner");
      const subject = await makeMember(a.id, "EngineerA", "member");
      const foreignSubject = await makeMember(b.id, "EngineerB", "member");
      const second = await makeMember(a.id, "ManagerB", "member");
      const project = await tx.project.create({ data: { organizationId: a.id,
        name: "Integration Project", code: `ENR-${suffix}`, location: "Dhaka",
        startDate: new Date("2026-11-01T00:00:00Z"), expectedEndDate: new Date("2027-03-01T00:00:00Z"),
      } });
      const site = await tx.constructionSite.create({ data: { organizationId: a.id,
        projectId: project.id, name: "Main Site", location: "Dhaka" } });
      const archivedSite = await tx.constructionSite.create({ data: { organizationId: a.id,
        projectId: project.id, name: "Archived Site", location: "Dhaka", archivedAt: new Date() } });
      return { orgA: a.id, orgB: b.id, ownerA: ownerA.id, ownerB: ownerB.id,
        subject: subject.id, second: second.id, foreignSubject: foreignSubject.id, project: project.id,
        site: site.id, archivedSite: archivedSite.id };
    });
  }, 60_000);

  afterAll(async () => {
    // Retain fixtures: auditEvent is append-only and deleting its rows is forbidden.
    if (prisma) await prisma.$disconnect();
  }, 60_000);

  it("refuses a non-owner grant without a stored audit event", async () => {
    const requestId = randomUUID();
    await expect(service.enrollStaff(member(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.second }, requestId, randomUUID())).rejects.toMatchObject({ status: 403 });
    expect(await prisma.auditEvent.count({ where: { requestId } })).toBe(0);
  });

  it("hides another organization's member and site", async () => {
    const foreignMemberRequest = randomUUID();
    const foreignSiteRequest = randomUUID();
    await expect(service.enrollStaff(owner(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.foreignSubject }, foreignMemberRequest, randomUUID())).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    // Use an ordinary member of org B so the self-grant guard cannot mask
    // the cross-tenant site lookup being exercised here.
    await expect(service.enrollStaff(foreignOwner(), { role: "SITE_ENGINEER", siteId: f.site,
      membershipId: f.foreignSubject }, foreignSiteRequest, randomUUID())).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(await prisma.auditEvent.count({ where: { requestId: { in: [foreignMemberRequest, foreignSiteRequest] } } })).toBe(0);
    expect(await prisma.operationalRoleAssignment.count({ where: { membershipId: f.foreignSubject } })).toBe(0);
    const foreignWorkspace = await service.getEnrollmentWorkspace(foreignOwner());
    expect(foreignWorkspace.projects).toHaveLength(0);
    expect(foreignWorkspace.sites).toHaveLength(0);
  });

  it("rejects an owner self-grant before resource lookup", async () => {
    const requestId = randomUUID();
    await expect(service.enrollStaff(foreignOwner(), { role: "SITE_ENGINEER", siteId: f.site,
      membershipId: f.ownerB }, requestId, randomUUID())).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await prisma.auditEvent.count({ where: { requestId } })).toBe(0);
  });

  it("blocks archived site enrollment", async () => {
    const requestId = randomUUID();
    // An existing same-tenant archived site is a lifecycle conflict, not
    // a missing or foreign resource. Keep the existing service contract.
    await expect(service.enrollStaff(owner(), { role: "SITE_ENGINEER", siteId: f.archivedSite,
      membershipId: f.subject }, requestId, randomUUID())).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(await prisma.auditEvent.count({ where: { requestId } })).toBe(0);
    expect(await prisma.siteAssignment.count({ where: { organizationId: f.orgA, siteId: f.archivedSite, membershipId: f.subject } })).toBe(0);
    expect(await prisma.operationalRoleAssignment.count({ where: { organizationId: f.orgA, siteId: f.archivedSite, membershipId: f.subject } })).toBe(0);
  });

  it("atomically creates PM enrollment, lead assignment, grant, and audit", async () => {
    pmRequestKey = randomUUID();
    const requestId = randomUUID();
    const grant = await service.enrollStaff(owner(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.subject }, requestId, pmRequestKey);
    projectGrantId = grant.id;
    expect(grant.role).toBe("PROJECT_MANAGER");
    const project = await prisma.project.findFirstOrThrow({ where: { id: f.project } });
    expect(project.managerMembershipId).toBe(f.subject);
    expect(await prisma.projectMember.count({ where: { organizationId: f.orgA, projectId: f.project,
      membershipId: f.subject, leftAt: null } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { requestId, resourceId: grant.id } })).toBe(1);
  });

  it("safely replays the same idempotency key and rejects a new duplicate", async () => {
    const replay = await service.enrollStaff(owner(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.subject }, randomUUID(), pmRequestKey);
    expect(replay.id).toBe(projectGrantId);
    await expect(service.enrollStaff(owner(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.subject }, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
  });

  it("enforces a single lead PM at the DB boundary", async () => {
    await expect(service.enrollStaff(owner(), { role: "PROJECT_MANAGER", projectId: f.project,
      membershipId: f.second }, randomUUID(), randomUUID())).rejects.toMatchObject({ status: 409 });
  });

  it("creates site assignment and SITE_ENGINEER grant in one transaction", async () => {
    const grant = await service.enrollStaff(owner(), { role: "SITE_ENGINEER", siteId: f.site,
      membershipId: f.subject }, randomUUID(), randomUUID());
    siteGrantId = grant.id;
    expect(grant.projectId).toBe(f.project);
    expect(await prisma.siteAssignment.count({ where: { organizationId: f.orgA, siteId: f.site,
      membershipId: f.subject, endedAt: null } })).toBe(1);
  });

  it("prevents a foreign owner from revoking a grant", async () => {
    await expect(service.revokeStaffEnrollment(foreignOwner(), siteGrantId, randomUUID()))
      .rejects.toMatchObject({ status: 404 });
  });

  it("revokes SITE_ENGINEER without removing the still-active PM enrollment", async () => {
    await service.revokeStaffEnrollment(owner(), siteGrantId, randomUUID());
    expect(await prisma.siteAssignment.count({ where: { siteId: f.site, membershipId: f.subject,
      endedAt: null } })).toBe(0);
    expect(await prisma.projectMember.count({ where: { projectId: f.project,
      membershipId: f.subject, leftAt: null } })).toBe(1);
    expect(await prisma.operationalRoleAssignment.count({ where: { id: projectGrantId, revokedAt: null } })).toBe(1);
  });

  it("revokes lead PM and safely closes only the final project membership", async () => {
    const requestId = randomUUID();
    await service.revokeStaffEnrollment(owner(), projectGrantId, requestId);
    expect((await prisma.project.findFirstOrThrow({ where: { id: f.project } })).managerMembershipId).toBeNull();
    expect(await prisma.projectMember.count({ where: { projectId: f.project,
      membershipId: f.subject, leftAt: null } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { requestId, resourceId: projectGrantId } })).toBe(1);
  });
});
