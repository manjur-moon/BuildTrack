import { describe, expect, it } from "vitest";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import { canViewInventory, canManageCatalog, scopedInventoryWhere } from "@/server/inventory/access";

const actor = (role: "owner" | "member", grant?: AuthorizationContext["grants"][number]): AuthorizationContext => ({
  organizationId: "org-A", membershipId: "m1", membershipActive: true, emailVerified: true,
  betterAuthRole: role, grants: grant ? [grant] : [],
});
const siteGrant = { role: "SITE_ENGINEER", scope: "site", organizationId: "org-A", projectId: "p-A", siteId: "s-A" } as const;
const pmGrant = { role: "PROJECT_MANAGER", scope: "project", organizationId: "org-A", projectId: "p-A" } as const;

describe("Step 12 — RBAC matrix and scope", () => {
  it("owner can manage shared material catalogue", () => {
    expect(canManageCatalog(actor("owner"))).toBe(true);
    expect(canManageCatalog(actor("member", siteGrant))).toBe(false);
  });
  it("engineer may request/record own site but cannot approve", () => {
    const a = actor("member", siteGrant);
    expect(hasPermission(a, "material-request:create", { organizationId: "org-A", projectId: "p-A", siteId: "s-A" })).toBe(true);
    expect(hasPermission(a, "stock:record", { organizationId: "org-A", projectId: "p-A", siteId: "s-A" })).toBe(true);
    expect(hasPermission(a, "material-request:approve", { organizationId: "org-A", projectId: "p-A", siteId: "s-A" })).toBe(false);
    expect(hasPermission(a, "inventory:view", { organizationId: "org-A", projectId: "p-A", siteId: "s-B" })).toBe(false);
  });
  it("PM may approve only on assigned project", () => {
    const a = actor("member", pmGrant);
    expect(hasPermission(a, "material-request:approve", { organizationId: "org-A", projectId: "p-A", siteId: "s-A" })).toBe(true);
    expect(hasPermission(a, "material-request:approve", { organizationId: "org-A", projectId: "p-B", siteId: "s-B" })).toBe(false);
  });
  it("builds database scope with site grants, not a broad organization-only filter", () => {
    const a = actor("member", siteGrant);
    expect(canViewInventory(a)).toBe(true);
    expect(scopedInventoryWhere(a)).toMatchObject({ organizationId: "org-A", OR: [{ projectId: { in: [] } }, { id: { in: ["s-A"] } }] });
    expect(canViewInventory(actor("member"))).toBe(false);
  });
  it("disabled or unverified actors cannot access inventory", () => {
    expect(canViewInventory({ ...actor("owner"), emailVerified: false })).toBe(false);
    expect(canViewInventory({ ...actor("owner"), membershipActive: false })).toBe(false);
  });
});
