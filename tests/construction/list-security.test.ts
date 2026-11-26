import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationContext, OperationalGrant } from "@/server/rbac/policy";
import { parseProjectListQuery, parseSiteListQuery } from "@/server/construction/list-query";

const mocks = vi.hoisted(() => ({
  projectFindMany: vi.fn(), projectCount: vi.fn(), siteFindMany: vi.fn(), siteCount: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({ prisma: {
  project: { findMany: mocks.projectFindMany, count: mocks.projectCount },
  constructionSite: { findMany: mocks.siteFindMany, count: mocks.siteCount },
} }));
import { listProjects } from "@/server/construction/projects";
import { listSites } from "@/server/construction/sites";

function actor(grants: OperationalGrant[] = [], betterAuthRole = "member"): AuthorizationContext {
  return { organizationId: "orgA", membershipId: "memberA", membershipActive: true,
    emailVerified: true, betterAuthRole, grants };
}
const pm: OperationalGrant = { organizationId: "orgA", role: "PROJECT_MANAGER", scope: "project", projectId: "projA" };
const engineer: OperationalGrant = { organizationId: "orgA", role: "SITE_ENGINEER", scope: "site", projectId: "projA", siteId: "siteA" };
const contractor: OperationalGrant = { organizationId: "orgA", role: "CONTRACTOR", scope: "project", projectId: "projA" };
const stamp = new Date("2026-11-26T00:00:00.000Z");
const project = { id: "projA", organizationId: "orgA", name: "Bridge", code: "BR-01", status: "ACTIVE",
  description: "classified", location: "hidden address", startDate: stamp, expectedEndDate: stamp,
  actualEndDate: null, createdAt: stamp, updatedAt: stamp };
const site = { id: "siteA", projectId: "projA", organizationId: "orgA", name: "North", location: "Dhaka",
  status: "ACTIVE", createdAt: stamp, updatedAt: stamp };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectFindMany.mockResolvedValue([project]); mocks.projectCount.mockResolvedValue(1);
  mocks.siteFindMany.mockResolvedValue([site]); mocks.siteCount.mockResolvedValue(1);
});

describe("Step 9 — database-first tenant/RBAC filtering", () => {
  it("never queries projects for an unassigned member", async () => {
    expect((await listProjects(actor(), parseProjectListQuery(new URLSearchParams("q=bridge")))).total).toBe(0);
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });
  it("restricts PM pagination, count, and search to assigned project IDs", async () => {
    const output = await listProjects(actor([pm]), parseProjectListQuery(new URLSearchParams("q=bridge&status=ACTIVE&page=2&limit=10")));
    const arg = mocks.projectFindMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ organizationId: "orgA", archivedAt: null, id: { in: ["projA"] }, status: "ACTIVE" });
    expect(arg.where.OR).toHaveLength(2);
    expect(arg.skip).toBe(10); expect(arg.take).toBe(10);
    expect(mocks.projectCount.mock.calls[0][0].where).toEqual(arg.where);
    expect(output.items).toHaveLength(1);
  });
  it("rejects summary-only project date filters and private-date sort to prevent count/order leakage", async () => {
    const summaryActor = actor([contractor]);
    await expect(listProjects(summaryActor, parseProjectListQuery(new URLSearchParams("from=2026-01-01")))).rejects.toThrow();
    await expect(listProjects(summaryActor, parseProjectListQuery(new URLSearchParams("sortBy=expectedEndDate")))).rejects.toThrow();
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });
  it("does not expose restricted project fields to a summary-only contractor", async () => {
    const output = await listProjects(actor([contractor]), parseProjectListQuery(new URLSearchParams("q=BR-01")));
    expect(output.items[0]).toMatchObject({ name: "Bridge", code: "BR-01", visibility: "summary" });
    expect(output.items[0]).not.toHaveProperty("location");
    expect(output.items[0]).not.toHaveProperty("description");
  });
  it("keeps SITE RBAC OR separate from site SEARCH OR", async () => {
    const output = await listSites(actor([engineer]), parseSiteListQuery(new URLSearchParams("q=Dhaka&status=ACTIVE&projectId=projA")));
    const arg = mocks.siteFindMany.mock.calls[0][0];
    expect(arg.where.organizationId).toBe("orgA");
    expect(arg.where.project).toMatchObject({ is: { organizationId: "orgA", archivedAt: null } });
    expect(arg.where.OR).toEqual([{ id: { in: ["siteA"] } }]);
    expect(arg.where.AND[0].OR).toHaveLength(2);
    expect(mocks.siteCount.mock.calls[0][0].where).toEqual(arg.where);
    expect(output.items).toHaveLength(1);
  });
  it("prevents members with no site grant from querying site data", async () => {
    expect((await listSites(actor(), parseSiteListQuery(new URLSearchParams()))).total).toBe(0);
    expect(mocks.siteFindMany).not.toHaveBeenCalled();
  });
});
