import { describe, it, expect } from "vitest";
import { createTaskSchema, updateTaskSchema, parseTaskListQuery, validateProgressTransition } from "@/server/construction/task-input";

const valid = { projectId: "project-1", title: "Pour column concrete", dueOn: "2027-04-01" };
describe("Step 11 — Task validation and lifecycle", () => {
  it("rejects invalid calendar dates and inconsistent start/due dates", () => {
    expect(createTaskSchema.safeParse({ ...valid, startsOn: "2027-04-02" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...valid, dueOn: "2027-02-30" }).success).toBe(false);
  });
  it("rejects unexpected create/update fields", () => {
    expect(createTaskSchema.safeParse({ ...valid, organizationId: "foreign-org" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ expectedUpdatedAt: "2026-11-26T10:00:00.000Z" }).success).toBe(false);
  });
  it("accepts valid task details with defaults", () => {
    const result = createTaskSchema.parse(valid);
    expect(result.priority).toBe("MEDIUM");
    expect(result.dueOn).toBe("2027-04-01");
  });
  it("rejects unrecognized query keys and duplicate parameters", () => {
    expect(() => parseTaskListQuery(new URLSearchParams("organizationId=other"))).toThrow();
    expect(() => parseTaskListQuery(new URLSearchParams("q=a&q=b"))).toThrow();
    expect(() => parseTaskListQuery(new URLSearchParams("sortBy=organizationId"))).toThrow();
  });
  it("allows combined scoped filters but caps page size", () => {
    const result = parseTaskListQuery(new URLSearchParams("status=REVIEW&priority=HIGH&mine=true&limit=100"));
    expect(result.status).toBe("REVIEW"); expect(result.mine).toBe(true);
    expect(() => parseTaskListQuery(new URLSearchParams("limit=101"))).toThrow();
  });
  it("requires review before manager approval", () => {
    expect(() => validateProgressTransition("TODO", "COMPLETED", 100, true)).toThrow();
    expect(() => validateProgressTransition("IN_PROGRESS", "REVIEW", 35, false)).not.toThrow();
    expect(() => validateProgressTransition("REVIEW", "COMPLETED", 100, false)).toThrow();
    expect(() => validateProgressTransition("REVIEW", "COMPLETED", 100, true)).not.toThrow();
  });
  it("preserves DB progress constraint including TODO and completed state", () => {
    expect(() => validateProgressTransition("TODO", "IN_PROGRESS", 100, false)).toThrow();
    expect(() => validateProgressTransition("IN_PROGRESS", "TODO", 15, false)).toThrow();
    expect(() => validateProgressTransition("REVIEW", "COMPLETED", 99, true)).toThrow();
  });
});
