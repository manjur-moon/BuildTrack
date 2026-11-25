import { describe, expect, it } from "vitest";
import type { AuthorizationContext, OperationalGrant } from "@/server/rbac/policy";
import { canReadProject, projectReadScope, siteReadScope, canCreateSite, canCreateProject } from "@/server/construction/scope";

const ctx = (grants: OperationalGrant[] = [], betterAuthRole = "member"): AuthorizationContext => ({
  organizationId: "org-1", membershipId: "member-1", membershipActive: true,
  emailVerified: true, betterAuthRole, grants,
});
const pm: OperationalGrant = { role: "PROJECT_MANAGER", scope: "project", organizationId: "org-1", projectId: "p1" };
const engineer: OperationalGrant = { role: "SITE_ENGINEER", scope: "site", organizationId: "org-1", projectId: "p1", siteId: "s1" };
const contractor: OperationalGrant = { role: "CONTRACTOR", scope: "project", organizationId: "org-1", projectId: "p1" };
const finance: OperationalGrant = { role: "FINANCE_MANAGER", scope: "organization", organizationId: "org-1" };

describe("Step 8 tenant-scoped access selection", () => {
  it("owner sees all projects and sites and can create", () => {
    expect(projectReadScope(ctx([], "owner")).all).toBe(true);
    expect(siteReadScope(ctx([], "owner")).all).toBe(true);
    expect(canCreateProject(ctx([], "owner"))).toBe(true);
  });
  it("default member sees nothing", () => {
    expect(projectReadScope(ctx())).toEqual({ all: false, projectIds: [] });
    expect(siteReadScope(ctx()).siteIds).toEqual([]);
    expect(canCreateProject(ctx())).toBe(false);
  });
  it("project manager only sees their assigned project and sites", () => {
    expect(projectReadScope(ctx([pm]))).toEqual({ all: false, projectIds: ["p1"] });
    expect(siteReadScope(ctx([pm])).projectIds).toEqual(["p1"]);
    expect(canCreateSite(ctx([pm]), "p1")).toBe(true);
    expect(canCreateSite(ctx([pm]), "p2")).toBe(false);
  });
  it("site engineer only sees their own site", () => {
    expect(projectReadScope(ctx([engineer])).projectIds).toEqual([]);
    expect(siteReadScope(ctx([engineer])).siteIds).toEqual(["s1"]);
    expect(canCreateSite(ctx([engineer]), "p1")).toBe(false);
  });
  it("contractor receives summary, not full details", () => {
    expect(canReadProject(ctx([contractor]), { organizationId: "org-1", projectId: "p1" })).toBe("summary");
    expect(canReadProject(ctx([contractor]), { organizationId: "org-1", projectId: "p2" })).toBeNull();
    expect(siteReadScope(ctx([contractor])).siteIds).toEqual([]);
  });
  it("finance org grant sees all projects but not sites", () => {
    expect(projectReadScope(ctx([finance])).all).toBe(true);
    expect(siteReadScope(ctx([finance])).all).toBe(false);
    expect(canCreateProject(ctx([finance]))).toBe(false);
  });
  it("cross-organization resources are invisible", () => {
    expect(canReadProject(ctx([pm]), { organizationId: "org-2", projectId: "p1" })).toBeNull();
  });
});
