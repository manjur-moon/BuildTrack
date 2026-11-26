import { describe, expect, it } from "vitest";
import { taskReadScope, taskListFilter } from "@/server/construction/task-scope";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { parseTaskListQuery } from "@/server/construction/task-input";

const base: AuthorizationContext = {
  organizationId: "org-A", membershipId: "member-1", membershipActive: true,
  emailVerified: true, betterAuthRole: "member", grants: [],
};
describe("Step 11 — DB-level scope and tenant separation", () => {
  it("defaults to no rows without an active operational grant", () => {
    expect(taskReadScope(base)).toMatchObject({ organizationId: "org-A", id: "__no_authorized_tasks__" });
  });
  it("permits full org scope only for a real owner", () => {
    expect(taskReadScope({ ...base, betterAuthRole: "owner" })).toMatchObject({ organizationId: "org-A" });
    expect(taskReadScope({ ...base, betterAuthRole: "member" }).id).toBe("__no_authorized_tasks__");
  });
  it("restricts a Project Manager to their assigned project", () => {
    const where = taskReadScope({ ...base, grants: [{ organizationId: "org-A", projectId: "project-1",
      scope: "project", role: "PROJECT_MANAGER" }] });
    expect(where.OR).toEqual([{ projectId: { in: ["project-1"] } }]);
  });
  it("restricts a Site Engineer to their assigned site", () => {
    const where = taskReadScope({ ...base, grants: [{ organizationId: "org-A", projectId: "project-1",
      siteId: "site-1", scope: "site", role: "SITE_ENGINEER" }] });
    expect(where.OR).toEqual([{ siteId: { in: ["site-1"] } }]);
  });
  it("contractor must hold a task assignment as well as an active project role", () => {
    const where = taskReadScope({ ...base, grants: [{ organizationId: "org-A", projectId: "project-1",
      scope: "project", role: "CONTRACTOR" }] });
    const rule = Array.isArray(where.OR) ? where.OR[0] : null;
    expect(rule).toMatchObject({ projectId: { in: ["project-1"] },
      assignees: { some: { membershipId: "member-1", unassignedAt: null } } });
  });
  it("rejects foreign organization grants", () => {
    const where = taskReadScope({ ...base, grants: [{ organizationId: "foreign-org", projectId: "project-1",
      scope: "project", role: "PROJECT_MANAGER" }] });
    expect(where.id).toBe("__no_authorized_tasks__");
  });
  it("search filter OR remains separate from SQL RBAC scope OR", () => {
    const q = parseTaskListQuery(new URLSearchParams("q=concrete&status=IN_PROGRESS"));
    const filter = taskListFilter(base, q);
    expect(filter.OR).toBeDefined();
    expect(filter.status).toBe("IN_PROGRESS");
    // Actual service combines scopes under AND, not spread/overwrite.
  });
});
