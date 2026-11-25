import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ApiError } from "../src/server/api/errors";
import { parseInput } from "../src/server/api/validation";
import { parsePagination } from "../src/server/api/pagination";

describe("API foundation validation", () => {
  it("rejects unknown request properties", () => {
    expect(() => parseInput(z.strictObject({ name: z.string() }), { name: "A", organizationId: "spoofed" })).toThrow(ApiError);
  });
  it("defaults to 20 rows and page 1", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });
  it("rejects 101 rows", () => {
    expect(() => parsePagination(new URLSearchParams("limit=101"))).toThrow(ApiError);
  });
  it("rejects invalid page", () => {
    expect(() => parsePagination(new URLSearchParams("page=0"))).toThrow(ApiError);
  });
});
