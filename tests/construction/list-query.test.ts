import { describe, expect, it } from "vitest";
import {
  parseProjectListQuery, parseSiteListQuery, projectListFilter,
  siteListFilter, projectListOrder, siteListOrder, listMeta,
} from "@/server/construction/list-query";

const params = (input = "") => new URLSearchParams(input);

describe("Step 9 — allowlisted search/filter/sort/pagination", () => {
  it("defaults to a stable page and deterministic created sort", () => {
    expect(parseProjectListQuery(params())).toMatchObject({ page: 1, limit: 20, q: "", sortBy: "createdAt", order: "desc" });
    expect(projectListOrder(parseProjectListQuery(params()))).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(siteListOrder(parseSiteListQuery(params("sortBy=name&order=asc")))).toEqual([{ name: "asc" }, { id: "desc" }]);
  });
  it("accepts combined project filters with calendar-date input", () => {
    const query = parseProjectListQuery(params("q=%20bridge%20&status=ACTIVE&from=2026-01-01&to=2026-12-31&sortBy=expectedEndDate&order=asc&page=3&limit=50"));
    expect(query).toMatchObject({ q: "bridge", status: "ACTIVE", sortBy: "expectedEndDate", page: 3, limit: 50 });
    const where = projectListFilter(query);
    expect(where.status).toBe("ACTIVE");
    expect(where.startDate).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z"), lte: new Date("2026-12-31T00:00:00.000Z") });
    expect(where.OR).toHaveLength(2);
  });
  it("accepts site project, status, search and inclusive created-date end", () => {
    const query = parseSiteListQuery(params("projectId=p-1&q=tower&status=ACTIVE&from=2026-11-01&to=2026-11-26"));
    const where = siteListFilter(query);
    expect(where.projectId).toBe("p-1");
    expect(where.status).toBe("ACTIVE");
    expect(where.OR).toHaveLength(2);
    expect(where.createdAt).toEqual({ gte: new Date("2026-11-01T00:00:00.000Z"), lt: new Date("2026-11-27T00:00:00.000Z") });
  });
  it.each([
    "page=0", "page=-1", "page=1.5", "page=NaN", "page=99999999", "limit=101", "limit=0", "limit=1e3",
    "sortBy=dropTable", "order=UP", "status=PAID", "from=2026-02-30", "from=2026-05-01&to=2026-04-01",
    "q=" + "a".repeat(101), "organizationId=another-org", "page=1&page=2", "q=x&q=y",
  ])("rejects malformed or untrusted project input: %s", (query) => {
    expect(() => parseProjectListQuery(params(query))).toThrow();
  });
  it.each(["status=COMPLETED", "sortBy=code", "projectId=" + "x".repeat(129), "cursor=oops", "from=2026-13-01"])(
    "rejects invalid site input: %s", (query) => expect(() => parseSiteListQuery(params(query))).toThrow(),
  );
  it("supports up to 100 requested rows and limits pages to prevent unbounded offsets", () => {
    expect(parseSiteListQuery(params("limit=100&page=10000")).limit).toBe(100);
    expect(() => parseSiteListQuery(params("page=10001"))).toThrow();
  });
  it("exposes accurate page metadata without client-side filtering", () => {
    expect(listMeta(2, 20, 43)).toEqual({ page: 2, limit: 20, total: 43, totalPages: 3, hasPrevious: true, hasNext: true });
    expect(listMeta(1, 20, 0).totalPages).toBe(0);
  });
});
