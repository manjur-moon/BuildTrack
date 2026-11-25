import { describe, expect, it } from "vitest";
import { deriveOperationalGrants, siteAssignmentKey, type PersistedGrant } from "../../src/server/rbac/role-grants";
import { hasPermission } from "../../src/server/rbac/policy";

const at = new Date("2026-11-25T00:00:00.000Z");
const row = (change: Partial<PersistedGrant> = {}): PersistedGrant => ({
  organizationId: "org-a", role: "PROJECT_MANAGER", scope: "PROJECT",
  projectId: "p1", siteId: null, revokedAt: null, expiresAt: null,
  ...change,
});
const assignments = {
  activeProjectIds: new Set(["p1"]),
  activeSiteKeys: new Set([siteAssignmentKey("p1", "s1")]),
  activeContractorProjectIds: new Set(["p1"]),
};
const derived = (rows: PersistedGrant[], changes: Partial<typeof assignments> = {}) =>
  deriveOperationalGrants("org-a", rows, { ...assignments, ...changes }, at);

describe("Step 6B persisted role authorization", () => {
  it("permits a live project role in the active project", () => {
    const grants = derived([row()]);
    expect(grants).toEqual([{ role: "PROJECT_MANAGER", scope: "project", organizationId: "org-a", projectId: "p1" }]);
  });
  it("denies a role when the project membership has ended", () => {
    expect(derived([row()], { activeProjectIds: new Set() })).toEqual([]);
  });
  it("denies an expired role", () => {
    expect(derived([row({ expiresAt: at })])).toEqual([]);
  });
  it("denies a revoked role", () => {
    expect(derived([row({ revokedAt: new Date(at.getTime() - 1) })])).toEqual([]);
  });
  it("denies rows belonging to another organization", () => {
    expect(derived([row({ organizationId: "org-b" })])).toEqual([]);
  });
  it("denies an unknown role or malformed scope", () => {
    expect(derived([row({ role: "SUPERADMIN" }), row({ scope: "ORGANIZATION", projectId: "p1" })])).toEqual([]);
  });
  it("allows organization finance without a project membership", () => {
    expect(derived([row({ role: "FINANCE_MANAGER", scope: "ORGANIZATION", projectId: null })],
      { activeProjectIds: new Set() })).toEqual([
        { role: "FINANCE_MANAGER", scope: "organization", organizationId: "org-a" },
      ]);
  });
  it("denies site engineer when the site assignment has ended", () => {
    const site = row({ scope: "SITE", role: "SITE_ENGINEER", siteId: "s1" });
    expect(derived([site], { activeSiteKeys: new Set() })).toEqual([]);
    expect(derived([site])).toHaveLength(1);
  });
  it("denies a contractor whose company or project contract is no longer active", () => {
    const contractor = row({ role: "CONTRACTOR" });
    expect(derived([contractor], { activeContractorProjectIds: new Set() })).toEqual([]);
    expect(derived([contractor])).toHaveLength(1);
  });
  it("does not confer project permissions from Better Auth member role alone", () => {
    const grants = derived([]);
    expect(hasPermission({ organizationId: "org-a", membershipId: "m1", membershipActive: true,
      emailVerified: true, betterAuthRole: "member", grants },
      "project:view", { organizationId: "org-a", projectId: "p1" })).toBe(false);
  });
  it("prevents an assigned contractor from reading an unassigned task", () => {
    const grants = derived([row({ role: "CONTRACTOR" })]);
    const context = { organizationId: "org-a", membershipId: "m1", membershipActive: true,
      emailVerified: true, betterAuthRole: "member", grants };
    expect(hasPermission(context, "task:view", { organizationId: "org-a", projectId: "p1",
      assignedMembershipIds: ["m2"] })).toBe(false);
  });
});
