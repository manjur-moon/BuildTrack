import { describe, expect, it } from "vitest";
import { canUseInbox, canViewActivity, visibleAlertTypes, alertTemplates } from "@/server/notifications/rules";
import { inboxQuery, inboxMutation, activityQuery } from "@/server/notifications/input";
import type { AuthorizationContext } from "@/server/rbac/policy";
const member: AuthorizationContext = { organizationId: "org", membershipId: "m", membershipActive: true, emailVerified: true, betterAuthRole: "member", grants: [] };
describe("Step 13D.3 notification scope and validation", () => {
  it("permits an active ordinary member only system notifications", () => {
    expect(canUseInbox(member)).toBe(true); expect(visibleAlertTypes(member)).toEqual(["SYSTEM"]); expect(canViewActivity(member)).toBe(false);
    expect(visibleAlertTypes({ ...member, membershipActive: false })).toEqual([]);
    expect(visibleAlertTypes({ ...member, emailVerified: false })).toEqual([]);
  });
  it("allows owner and organization ADMIN audit, not finance or project managers", () => {
    expect(canViewActivity({ ...member, betterAuthRole: "owner" })).toBe(true);
    expect(canViewActivity({ ...member, grants: [{ role: "ADMIN", scope: "organization", organizationId: "org" }] })).toBe(true);
    expect(canViewActivity({ ...member, grants: [{ role: "FINANCE_MANAGER", scope: "organization", organizationId: "org" }] })).toBe(false);
    expect(canViewActivity({ ...member, grants: [{ role: "PROJECT_MANAGER", scope: "project", organizationId: "org", projectId: "p" }] })).toBe(false);
  });
  it("isolates contractor and engineer alert categories from finance", () => {
    const contractor: AuthorizationContext = { ...member, grants: [{ role: "CONTRACTOR", scope: "project", organizationId: "org", projectId: "p" }] };
    expect(visibleAlertTypes(contractor)).toEqual(["SYSTEM", "TASK_ASSIGNED", "TASK_OVERDUE"]);
    const engineer: AuthorizationContext = { ...member, grants: [{ role: "SITE_ENGINEER", scope: "site", organizationId: "org", projectId: "p", siteId: "s" }] };
    expect(visibleAlertTypes(engineer)).toContain("LOW_STOCK"); expect(visibleAlertTypes(engineer)).not.toContain("BUDGET_OVERRUN");
    expect(visibleAlertTypes({ ...member, grants: [{ role: "ADMIN", scope: "organization", organizationId: "foreign" }] })).toEqual(["SYSTEM"]);
  });
  it("rejects forged recipient and organization selectors, malformed pages and unknown actions", () => {
    expect(inboxQuery.parse({})).toEqual({ page: 1, filter: "all" });
    expect(inboxQuery.safeParse({ page: "10000" }).success).toBe(false);
    expect(inboxQuery.safeParse({ recipientMembershipId: "other" }).success).toBe(false);
    expect(inboxMutation.safeParse({ action: "set-read", id: "x", read: true, organizationId: "other" }).success).toBe(false);
    expect(inboxMutation.safeParse({ action: "delete", id: "x" }).success).toBe(false);
    expect(activityQuery.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });
  it("uses only fixed internal links", () => {
    expect(Object.values(alertTemplates).every(t => /^\/dashboard(?:\/[a-z]+)?$/.test(t.href))).toBe(true);
  });
});
