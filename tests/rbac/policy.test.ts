import { describe, expect, it } from "vitest";
import { hasPermission, type AuthorizationContext, type OperationalGrant } from "../../src/server/rbac/policy";

const owner: AuthorizationContext = {
  organizationId: "org-a", membershipId: "member-owner", membershipActive: true,
  emailVerified: true, betterAuthRole: "owner", grants: [],
};
const member = (grants: OperationalGrant[]): AuthorizationContext => ({
  organizationId: "org-a", membershipId: "member-1", membershipActive: true,
  emailVerified: true, betterAuthRole: "member", grants,
});

const pm: OperationalGrant = { role: "PROJECT_MANAGER", scope: "project", organizationId: "org-a", projectId: "p-1" };
const siteEngineer: OperationalGrant = { role: "SITE_ENGINEER", scope: "site", organizationId: "org-a", projectId: "p-1", siteId: "s-1" };
const contractor: OperationalGrant = { role: "CONTRACTOR", scope: "project", organizationId: "org-a", projectId: "p-1" };

 describe("BuildTrack Step 6 default-deny RBAC", () => {
  it("recognizes only exact Better Auth owner as implicit ADMIN", () => {
    expect(hasPermission(owner, "role:assign", { organizationId: "org-a" })).toBe(true);
    expect(hasPermission({ ...owner, betterAuthRole: "admin" }, "role:assign", { organizationId: "org-a" })).toBe(false);
    expect(hasPermission({ ...owner, betterAuthRole: " owner" }, "role:assign", { organizationId: "org-a" })).toBe(false);
  });

  it("rejects inactive and unverified members, even owner", () => {
    expect(hasPermission({ ...owner, membershipActive: false }, "role:assign", { organizationId: "org-a" })).toBe(false);
    expect(hasPermission({ ...owner, emailVerified: false }, "role:assign", { organizationId: "org-a" })).toBe(false);
  });

  it("denies access across organizations, even to owner", () => {
    expect(hasPermission(owner, "project:view", { organizationId: "org-b", projectId: "p-1" })).toBe(false);
    expect(hasPermission(member([pm]), "project:view", { organizationId: "org-b", projectId: "p-1" })).toBe(false);
  });

  it("does not give Better Auth member a business role", () => {
    expect(hasPermission(member([]), "task:view", { organizationId: "org-a", projectId: "p-1" })).toBe(false);
  });

  it("restricts project managers to their assigned project", () => {
    expect(hasPermission(member([pm]), "project:update", { organizationId: "org-a", projectId: "p-1" })).toBe(true);
    expect(hasPermission(member([pm]), "project:update", { organizationId: "org-a", projectId: "p-2" })).toBe(false);
    expect(hasPermission(member([pm]), "role:assign", { organizationId: "org-a" })).toBe(false);
  });

  it("requires the exact site for a site engineer", () => {
    expect(hasPermission(member([siteEngineer]), "site:update", { organizationId: "org-a", projectId: "p-1", siteId: "s-1" })).toBe(true);
    expect(hasPermission(member([siteEngineer]), "site:update", { organizationId: "org-a", projectId: "p-1", siteId: "s-2" })).toBe(false);
    expect(hasPermission(member([siteEngineer]), "task:view", { organizationId: "org-a", projectId: "p-1" })).toBe(false);
  });

  it("restricts contractors to tasks assigned to their membership", () => {
    const ctx = member([contractor]);
    expect(hasPermission(ctx, "task:view", { organizationId: "org-a", projectId: "p-1", assignedMembershipIds: ["member-1"] })).toBe(true);
    expect(hasPermission(ctx, "task:view", { organizationId: "org-a", projectId: "p-1", assignedMembershipIds: ["other"] })).toBe(false);
    expect(hasPermission(ctx, "project:summary:view", { organizationId: "org-a", projectId: "p-1" })).toBe(true);
    expect(hasPermission(ctx, "expense:view", { organizationId: "org-a", projectId: "p-1" })).toBe(false);
  });

  it("requires separate expense recorder and poster", () => {
    const expense = { organizationId: "org-a", projectId: "p-1", expenseStatus: "DRAFT" as const };
    expect(hasPermission(owner, "expense:post", { ...expense, recordedByMembershipId: "member-owner" })).toBe(false);
    expect(hasPermission(owner, "expense:post", { ...expense, recordedByMembershipId: "other" })).toBe(true);
    expect(hasPermission(owner, "expense:post", { ...expense, expenseStatus: "POSTED", recordedByMembershipId: "other" })).toBe(false);
  });

  it("does not authorize project actions without a project", () => {
    expect(hasPermission(owner, "project:view", { organizationId: "org-a" })).toBe(false);
  });
});
