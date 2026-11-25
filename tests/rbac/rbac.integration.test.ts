import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadDotEnv } from "dotenv";
import type { AuthorizationContext } from "../../src/server/rbac/policy";

/**
 * Step 6D security integration tests.
 * Deliberately blocked unless an explicit, isolated local PostgreSQL database is selected.
 * No Prisma reset, schema push, or migrations are performed by this file.
 * Fixtures and their append-only audit evidence are retained in the disposable test database.
 * Never delete or mutate AuditEvent rows: the production schema protects them by trigger.
 */
const run = process.env.RUN_RBAC_INTEGRATION === "1";

if (run) {
  // Require an explicit environment override BEFORE reading .env, so tests can
  // never silently fall back to buildtrack_dev.
  const selected = process.env.DATABASE_URL;
  if (!selected) {
    throw new Error("Set DATABASE_URL explicitly to buildtrack_auth_test before running RBAC integration tests.");
  }
  const target = new URL(selected);
  if (
    target.pathname !== "/buildtrack_auth_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433"
  ) {
    throw new Error("RBAC integration tests must use buildtrack_auth_test on localhost:5433.");
  }
  const env = loadDotEnv({ path: ".env", override: false });
  if (env.error) throw new Error("Cannot load local authentication environment from .env.");
}

type Db = (typeof import("../../src/server/db/client"))["prisma"];
type Grant = (typeof import("../../src/server/rbac/manage-roles"))["grantOperationalRole"];
type Revoke = (typeof import("../../src/server/rbac/manage-roles"))["revokeOperationalRole"];
type GrantDeriver = (typeof import("../../src/server/rbac/role-grants"))["deriveOperationalGrants"];
type Policy = (typeof import("../../src/server/rbac/policy"))["hasPermission"];

type Fixture = {
  orgA: string;
  orgB: string;
  ownerA: string;
  subjectA: string;
  regularA: string;
  ownerB: string;
  projectA: string;
  projectB: string;
  siteA: string;
};

describe.skipIf(!run)("BuildTrack Step 6D — real PostgreSQL RBAC security", () => {
  let prisma: Db;
  let grantOperationalRole: Grant;
  let revokeOperationalRole: Revoke;
  let deriveOperationalGrants: GrantDeriver;
  let hasPermission: Policy;
  let fixture: Fixture;
  let projectAssignmentId: string;

  const owner = (): AuthorizationContext => ({
    organizationId: fixture.orgA,
    membershipId: fixture.ownerA,
    betterAuthRole: "owner",
    membershipActive: true,
    emailVerified: true,
    grants: [],
  });
  const regular = (): AuthorizationContext => ({
    organizationId: fixture.orgA,
    membershipId: fixture.regularA,
    betterAuthRole: "member",
    membershipActive: true,
    emailVerified: true,
    grants: [],
  });
  const requestId = () => `step6d-${randomUUID()}`;

  beforeAll(async () => {
    ({ prisma } = await import("../../src/server/db/client"));
    ({ grantOperationalRole, revokeOperationalRole } = await import("../../src/server/rbac/manage-roles"));
    ({ deriveOperationalGrants } = await import("../../src/server/rbac/role-grants"));
    ({ hasPermission } = await import("../../src/server/rbac/policy"));

    const tables = await prisma.$queryRaw<Array<{ tableName: string | null }>>`
      SELECT to_regclass('public.operational_role_assignment')::text AS "tableName"
    `;
    if (!tables[0]?.tableName) {
      throw new Error("RBAC migration missing from isolated test database. Do not run against buildtrack_dev.");
    }

    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    // One transaction guarantees complete rollback if fixture creation fails.
    const seeded = await prisma.$transaction(async (tx) => {
      const orgA = await tx.organization.create({ data: { name: `Step6D A ${suffix}`, slug: `step6d-a-${suffix}` } });
      const orgB = await tx.organization.create({ data: { name: `Step6D B ${suffix}`, slug: `step6d-b-${suffix}` } });
      const makeUser = (name: string) => tx.user.create({
        data: { name, email: `step6d-${name.toLowerCase()}-${suffix}@example.test`, emailVerified: true },
      });
      const [userOwnerA, userSubjectA, userRegularA, userOwnerB] = await Promise.all([
        makeUser("OwnerA"), makeUser("SubjectA"), makeUser("RegularA"), makeUser("OwnerB"),
      ]);
      const ownerA = await tx.member.create({ data: { organizationId: orgA.id, userId: userOwnerA.id, role: "owner" } });
      const subjectA = await tx.member.create({ data: { organizationId: orgA.id, userId: userSubjectA.id, role: "member" } });
      const regularA = await tx.member.create({ data: { organizationId: orgA.id, userId: userRegularA.id, role: "member" } });
      const ownerB = await tx.member.create({ data: { organizationId: orgB.id, userId: userOwnerB.id, role: "owner" } });
      const startDate = new Date("2026-11-01T00:00:00Z");
      const expectedEndDate = new Date("2027-05-01T00:00:00Z");
      const projectA = await tx.project.create({ data: {
        organizationId: orgA.id, name: "RBAC A Project", code: `R6D-${suffix}`,
        location: "Test Site A", startDate, expectedEndDate,
      } });
      const projectB = await tx.project.create({ data: {
        organizationId: orgB.id, name: "RBAC B Project", code: `R6D-${suffix}`,
        location: "Test Site B", startDate, expectedEndDate,
      } });
      await tx.projectMember.create({ data: {
        organizationId: orgA.id, projectId: projectA.id, membershipId: subjectA.id,
      } });
      const siteA = await tx.constructionSite.create({ data: {
        organizationId: orgA.id, projectId: projectA.id, name: "Site A", location: "Test Site A",
      } });
      return {
        fixture: { orgA: orgA.id, orgB: orgB.id, ownerA: ownerA.id, subjectA: subjectA.id,
          regularA: regularA.id, ownerB: ownerB.id, projectA: projectA.id, projectB: projectB.id, siteA: siteA.id },
      };
    });
    fixture = seeded.fixture;
  }, 60_000);

  afterAll(async () => {
    // PostgreSQL enforces AuditEvent immutability with a BEFORE DELETE/UPDATE
    // trigger, and audit evidence references its actor and organization.
    // Removing test fixtures would require breaking those protections.
    // Retain the randomly named fixture graph in buildtrack_auth_test only;
    // isolate a fresh disposable test DB for CI or periodically recreate
    // ONLY this dedicated test DB after an explicit review.
    if (prisma) await prisma.$disconnect();
  }, 60_000);

  it("rejects grants from a non-owner and persists no audit record", async () => {
    const id = requestId();
    await expect(grantOperationalRole(regular(), fixture.subjectA,
      { role: "ADMIN", scope: "ORGANIZATION" }, id)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.auditEvent.count({ where: { requestId: id } })).toBe(0);
  });

  it("rejects owner self-grants", async () => {
    await expect(grantOperationalRole(owner(), fixture.ownerA,
      { role: "ADMIN", scope: "ORGANIZATION" }, requestId())).rejects.toMatchObject({ status: 403 });
  });

  it("blocks cross-organization subjects", async () => {
    await expect(grantOperationalRole(owner(), fixture.ownerB,
      { role: "ADMIN", scope: "ORGANIZATION" }, requestId())).rejects.toMatchObject({ status: 404 });
  });

  it("rejects project grants without a same-tenant active ProjectMember", async () => {
    await expect(grantOperationalRole(owner(), fixture.subjectA,
      { role: "PROJECT_MANAGER", scope: "PROJECT", projectId: fixture.projectB }, requestId()))
      .rejects.toMatchObject({ status: 422 });
  });

  it("creates an authorized project grant with exactly one matching audit event", async () => {
    const id = requestId();
    const granted = await grantOperationalRole(owner(), fixture.subjectA,
      { role: "PROJECT_MANAGER", scope: "PROJECT", projectId: fixture.projectA }, id);
    projectAssignmentId = granted.id;
    expect(granted.membershipId).toBe(fixture.subjectA);
    expect(granted.projectId).toBe(fixture.projectA);
    const audit = await prisma.auditEvent.findMany({ where: { requestId: id, action: "rbac.role.granted" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resourceId).toBe(granted.id);
  });

  it("rejects duplicate live role grants by a database unique constraint", async () => {
    await expect(grantOperationalRole(owner(), fixture.subjectA,
      { role: "PROJECT_MANAGER", scope: "PROJECT", projectId: fixture.projectA }, requestId()))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.operationalRoleAssignment.count({ where: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA,
      role: "PROJECT_MANAGER", scope: "PROJECT", projectId: fixture.projectA, revokedAt: null,
    } })).toBe(1);
  });

  it("derives permission only for the explicitly assigned project", async () => {
    const persisted = await prisma.operationalRoleAssignment.findMany({ where: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA, revokedAt: null,
    } });
    const grants = deriveOperationalGrants(fixture.orgA, persisted,
      { activeProjectIds: new Set([fixture.projectA]), activeSiteKeys: new Set(),
        activeContractorProjectIds: new Set() });
    const context: AuthorizationContext = {
      ...regular(), membershipId: fixture.subjectA, grants,
    };
    expect(hasPermission(context, "project:view", { organizationId: fixture.orgA, projectId: fixture.projectA })).toBe(true);
    expect(hasPermission(context, "project:view", { organizationId: fixture.orgA, projectId: fixture.projectB })).toBe(false);
    expect(hasPermission(context, "project:view", { organizationId: fixture.orgB, projectId: fixture.projectB })).toBe(false);
    // A persisted grant by itself is insufficient after removing the active assignment snapshot.
    const staleGrants = deriveOperationalGrants(fixture.orgA, persisted,
      { activeProjectIds: new Set(), activeSiteKeys: new Set(), activeContractorProjectIds: new Set() });
    expect(staleGrants).toHaveLength(0);
  });

  it("revokes the grant, creates a matching audit event, and removes active access", async () => {
    const id = requestId();
    const result = await revokeOperationalRole(owner(), projectAssignmentId, id);
    expect(result.status).toBe("revoked");
    const row = await prisma.operationalRoleAssignment.findUnique({ where: { id: projectAssignmentId } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.revokedByMembershipId).toBe(fixture.ownerA);
    expect(await prisma.auditEvent.count({ where: {
      requestId: id, action: "rbac.role.revoked", resourceId: projectAssignmentId,
    } })).toBe(1);
    expect(await prisma.operationalRoleAssignment.count({ where: {
      id: projectAssignmentId, revokedAt: null,
    } })).toBe(0);
  });

  it("rejects repeated revocation", async () => {
    await expect(revokeOperationalRole(owner(), projectAssignmentId, requestId()))
      .rejects.toMatchObject({ status: 409 });
  });

  it("refuses SITE_ENGINEER grant without a live site assignment", async () => {
    await expect(grantOperationalRole(owner(), fixture.subjectA,
      { role: "SITE_ENGINEER", scope: "SITE", projectId: fixture.projectA, siteId: fixture.siteA }, requestId()))
      .rejects.toMatchObject({ status: 422 });
  });

  it("accepts SITE_ENGINEER only after a live matching assignment", async () => {
    await prisma.siteAssignment.create({ data: {
      organizationId: fixture.orgA, projectId: fixture.projectA,
      siteId: fixture.siteA, membershipId: fixture.subjectA,
    } });
    const granted = await grantOperationalRole(owner(), fixture.subjectA,
      { role: "SITE_ENGINEER", scope: "SITE", projectId: fixture.projectA, siteId: fixture.siteA }, requestId());
    expect(granted.siteId).toBe(fixture.siteA);
  });

  it("enforces role/scope CHECK constraints in PostgreSQL", async () => {
    await expect(prisma.operationalRoleAssignment.create({ data: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA,
      grantedByMembershipId: fixture.ownerA, role: "SITE_ENGINEER", scope: "ORGANIZATION",
    } })).rejects.toThrow();
  });

  it("enforces cross-tenant composite foreign keys in PostgreSQL", async () => {
    await expect(prisma.operationalRoleAssignment.create({ data: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA,
      grantedByMembershipId: fixture.ownerA, role: "PROJECT_MANAGER", scope: "PROJECT", projectId: fixture.projectB,
    } })).rejects.toThrow();
  });

  it("returns HTTP 401 for the protected context endpoint without a session", async () => {
    const { GET } = await import("../../src/app/api/v1/me/context/route");
    const request = new Request("http://localhost:3000/api/v1/me/context");
    const response = await GET(request as Parameters<typeof GET>[0]);
    expect(response.status).toBe(401);
  });

  // STEP 6D.2 — CONCURRENT RBAC INTEGRATION TESTS
  // Appended after the original 14 tests so their shared fixtures/assumptions stay intact.
  // These checks use the isolated buildtrack_auth_test guard already defined above.
  let concurrentGrantEvidence: {
    assignmentId: string;
    winningRequestId: string;
    rejectedRequestId: string;
  } | null = null;
  let concurrentRevokeEvidence: {
    assignmentId: string;
    grantRequestId: string;
    winningRequestId: string;
    rejectedRequestId: string;
  } | null = null;

  it("accepts exactly one of two simultaneous ADMIN organization grants", async () => {
    const ids = [requestId(), requestId()];
    const results = await Promise.allSettled(ids.map((id) =>
      grantOperationalRole(owner(), fixture.subjectA,
        { role: "ADMIN", scope: "ORGANIZATION" }, id),
    ));
    const successes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ value: result.value, requestId: ids[index]! }] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [{ reason: result.reason, requestId: ids[index]! }] : [],
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toMatchObject({ status: 409 });
    const winner = successes[0]!;
    const loser = failures[0]!;
    expect(await prisma.operationalRoleAssignment.count({ where: {
      organizationId: fixture.orgA, membershipId: fixture.subjectA,
      role: "ADMIN", scope: "ORGANIZATION", revokedAt: null,
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: {
      resourceId: winner.value.id, requestId: winner.requestId,
      action: "rbac.role.granted",
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { requestId: loser.requestId } })).toBe(0);
    concurrentGrantEvidence = {
      assignmentId: winner.value.id,
      winningRequestId: winner.requestId,
      rejectedRequestId: loser.requestId,
    };
  }, 30_000);

  it("accepts exactly one of two simultaneous revocations", async () => {
    const grantRequestId = requestId();
    const grant = await grantOperationalRole(owner(), fixture.subjectA,
      { role: "FINANCE_MANAGER", scope: "ORGANIZATION" }, grantRequestId);
    const ids = [requestId(), requestId()];
    const results = await Promise.allSettled(ids.map((id) =>
      revokeOperationalRole(owner(), grant.id, id),
    ));
    const successes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ value: result.value, requestId: ids[index]! }] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [{ reason: result.reason, requestId: ids[index]! }] : [],
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(successes[0]!.value.status).toBe("revoked");
    expect(failures[0]!.reason).toMatchObject({ status: 409 });
    const row = await prisma.operationalRoleAssignment.findUnique({ where: { id: grant.id } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(await prisma.auditEvent.count({ where: {
      requestId: successes[0]!.requestId, resourceId: grant.id,
      action: "rbac.role.revoked",
    } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { requestId: failures[0]!.requestId } })).toBe(0);
    concurrentRevokeEvidence = {
      assignmentId: grant.id,
      grantRequestId,
      winningRequestId: successes[0]!.requestId,
      rejectedRequestId: failures[0]!.requestId,
    };
  }, 30_000);

  it("preserves one audit event per successful concurrent change and none for rejected changes", async () => {
    expect(concurrentGrantEvidence).not.toBeNull();
    expect(concurrentRevokeEvidence).not.toBeNull();
    if (!concurrentGrantEvidence || !concurrentRevokeEvidence) {
      throw new Error("Concurrency setup checks did not succeed; audit verification cannot run.");
    }
    const grantAudits = await prisma.auditEvent.findMany({ where: {
      resourceId: concurrentGrantEvidence.assignmentId,
      action: "rbac.role.granted",
    }, select: { requestId: true } });
    expect(grantAudits.map((a) => a.requestId)).toEqual([concurrentGrantEvidence.winningRequestId]);

    const revokeAudits = await prisma.auditEvent.findMany({ where: {
      resourceId: concurrentRevokeEvidence.assignmentId,
      action: { in: ["rbac.role.granted", "rbac.role.revoked"] },
    }, select: { action: true, requestId: true } });
    expect(revokeAudits).toHaveLength(2);
    expect(revokeAudits).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "rbac.role.granted", requestId: concurrentRevokeEvidence.grantRequestId }),
      expect.objectContaining({ action: "rbac.role.revoked", requestId: concurrentRevokeEvidence.winningRequestId }),
    ]));
    expect(await prisma.auditEvent.count({ where: { requestId: { in: [
      concurrentGrantEvidence.rejectedRequestId,
      concurrentRevokeEvidence.rejectedRequestId,
    ] } } })).toBe(0);
  }, 30_000);

});
