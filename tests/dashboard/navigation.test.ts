import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../../src/server/rbac/policy";
import { getDashboardNavigation, getPermittedSection } from "../../src/server/dashboard/navigation";

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    organizationId: "org-a",
    membershipId: "mem-a",
    membershipActive: true,
    emailVerified: true,
    betterAuthRole: "member",
    grants: [],
    ...overrides,
  };
}
const keys = (ctx: AuthorizationContext) => getDashboardNavigation(ctx).flatMap((g) => g.items.map((i) => i.key));

describe("BuildTrack Step 7 dashboard role-aware navigation", () => {
  it("never assumes an ordinary organization member has operational privileges", () => {
    expect(keys(context())).toEqual(["overview", "notifications"]);
  });
  it("allows owner to see modules including owner-only team management", () => {
    const items = keys(context({ betterAuthRole: "owner" }));
    expect(items).toContain("team");
    expect(items).toContain("activity");
    expect(items).toContain("finance");
    expect(items).toContain("projects");
  });
  it("does not expose owner-only role management to operational ADMIN", () => {
    const items = keys(context({ grants: [{ role: "ADMIN", scope: "organization", organizationId: "org-a" }] }));
    expect(items).not.toContain("team");
    expect(items).toContain("projects");
  });
  it("project manager sees assigned project tasks and expenses (read access), but not team", () => {
    const items = keys(context({ grants: [{ role: "PROJECT_MANAGER", scope: "project", organizationId: "org-a", projectId: "prj-a" }] }));
    expect(items).toContain("projects");
    expect(items).toContain("tasks");
    expect(items).toContain("finance"); // Existing Step 6 policy grants expense:view, not expense:post.
    expect(items).not.toContain("team");
  });
  it("site engineer sees sites but does not see privileged role management", () => {
    const items = keys(context({ grants: [{ role: "SITE_ENGINEER", scope: "site", organizationId: "org-a", projectId: "prj-a", siteId: "site-a" }] }));
    expect(items).toContain("sites");
    expect(items).not.toContain("team");
  });
  it("contractor only sees permitted sections", () => {
    const items = keys(context({ grants: [{ role: "CONTRACTOR", scope: "project", organizationId: "org-a", projectId: "prj-a" }] }));
    expect(items).toContain("tasks");
    expect(items).toContain("projects");
    expect(items).not.toContain("finance");
    expect(items).not.toContain("activity");
  });
  it("ignores cross-organization grants", () => {
    const items = keys(context({ grants: [{ role: "ADMIN", scope: "organization", organizationId: "org-b" }] }));
    expect(items).toEqual(["overview", "notifications"]);
  });
  it("rejects inactive membership and unverified email", () => {
    expect(keys(context({ membershipActive: false }))).toEqual(["overview"]);
    expect(keys(context({ emailVerified: false }))).toEqual(["overview"]);
  });
  it("direct section access must be checked against current grants", () => {
    expect(getPermittedSection(context(), "team")).toBeNull();
    expect(getPermittedSection(context(), "finance")).toBeNull();
    expect(getPermittedSection(context({ betterAuthRole: "owner" }), "team")?.key).toBe("team");
    expect(getPermittedSection(context({ betterAuthRole: "owner" }), "../../unknown")).toBeNull();
  });
});
