import { describe, expect, it } from "vitest";
import { enrollStaffSchema, canManageStaffEnrollment } from "@/server/construction/enrollment-input";
import type { AuthorizationContext } from "@/server/rbac/policy";

const owner: AuthorizationContext = {
  organizationId: "org-A", membershipId: "owner-A", membershipActive: true,
  emailVerified: true, betterAuthRole: "owner", grants: [],
};

describe("Step 8 staff enrollment validation and authorization", () => {
  it("accepts a same-resource PM assignment", () => {
    expect(enrollStaffSchema.safeParse({ role: "PROJECT_MANAGER", membershipId: "member-A", projectId: "project-A" }).success).toBe(true);
  });
  it("accepts a site engineer assignment", () => {
    expect(enrollStaffSchema.safeParse({ role: "SITE_ENGINEER", membershipId: "member-A", siteId: "site-A" }).success).toBe(true);
  });
  it("rejects an engineer without site scope", () => {
    expect(enrollStaffSchema.safeParse({ role: "SITE_ENGINEER", membershipId: "member-A", projectId: "project-A" }).success).toBe(false);
  });
  it("rejects a PM with arbitrary site scope", () => {
    expect(enrollStaffSchema.safeParse({ role: "PROJECT_MANAGER", membershipId: "member-A", projectId: "project-A", siteId: "site-A" }).success).toBe(false);
  });
  it("rejects client-supplied organization or actor IDs", () => {
    expect(enrollStaffSchema.safeParse({ role: "PROJECT_MANAGER", membershipId: "member-A", projectId: "project-A", organizationId: "org-B" }).success).toBe(false);
    expect(enrollStaffSchema.safeParse({ role: "SITE_ENGINEER", membershipId: "member-A", siteId: "site-A", grantedByMembershipId: "owner-B" }).success).toBe(false);
  });
  it("rejects unsupported roles", () => {
    expect(enrollStaffSchema.safeParse({ role: "ADMIN", membershipId: "member-A", projectId: "project-A" }).success).toBe(false);
  });
  it("rejects invalid identifiers", () => {
    expect(enrollStaffSchema.safeParse({ role: "SITE_ENGINEER", membershipId: "", siteId: "site-A" }).success).toBe(false);
    expect(enrollStaffSchema.safeParse({ role: "SITE_ENGINEER", membershipId: "member-A", siteId: "" }).success).toBe(false);
  });
  it("permits a verified active organization owner", () => {
    expect(canManageStaffEnrollment(owner)).toBe(true);
  });
  it("denies members, even with project-manager grants", () => {
    expect(canManageStaffEnrollment({ ...owner, betterAuthRole: "member", grants: [{ role: "PROJECT_MANAGER", scope: "project", organizationId: "org-A", projectId: "p" }] })).toBe(false);
  });
  it("denies unverified or disabled owners", () => {
    expect(canManageStaffEnrollment({ ...owner, emailVerified: false })).toBe(false);
    expect(canManageStaffEnrollment({ ...owner, membershipActive: false })).toBe(false);
  });
});
