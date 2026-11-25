import { describe, expect, it } from "vitest";
import { createProjectSchema, updateProjectSchema, createSiteSchema, updateSiteSchema,
  archiveSchema, checkProjectDates } from "@/server/construction/input";

const project = { name: "North Wing", code: "bt-101", location: "Dhaka",
  startDate: "2026-12-01", expectedEndDate: "2027-03-01" };
const stamp = "2026-11-26T08:30:00.000Z";

describe("Step 8 validation (strict, date safe)", () => {
  it("accepts a normal project and normalizes its code", () => {
    const result = createProjectSchema.parse(project);
    expect(result.code).toBe("BT-101");
  });
  it("rejects reversed project dates", () => {
    expect(createProjectSchema.safeParse({ ...project, expectedEndDate: "2026-11-30" }).success).toBe(false);
  });
  it("rejects invalid calendar days", () => {
    expect(createProjectSchema.safeParse({ ...project, startDate: "2026-02-30" }).success).toBe(false);
  });
  it("rejects potentially ambiguous local dates", () => {
    expect(createProjectSchema.safeParse({ ...project, startDate: "12/01/2026" }).success).toBe(false);
  });
  it("rejects unrecognized fields (including tenant injection)", () => {
    expect(createProjectSchema.safeParse({ ...project, organizationId: "org-other" }).success).toBe(false);
  });
  it("rejects malformed and oversize project codes", () => {
    expect(createProjectSchema.safeParse({ ...project, code: "A" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...project, code: "DROP;TABLE" }).success).toBe(false);
  });
  it("requires a matching optimistic lock for updates", () => {
    expect(updateProjectSchema.safeParse({ name: "Changed" }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ expectedUpdatedAt: stamp, name: "Changed" }).success).toBe(true);
  });
  it("rejects empty project patches", () => {
    expect(updateProjectSchema.safeParse({ expectedUpdatedAt: stamp }).success).toBe(false);
  });
  it("rejects invalid status values", () => {
    expect(updateProjectSchema.safeParse({ expectedUpdatedAt: stamp, status: "DELETED" }).success).toBe(false);
  });
  it("requires date on completion, and forbids premature actual end", () => {
    expect(checkProjectDates("2026-11-01", "2027-01-01", null, "COMPLETED")).toContain("Completion");
    expect(checkProjectDates("2026-11-01", "2027-01-01", "2026-10-31", "COMPLETED")).toContain("Actual");
    expect(checkProjectDates("2026-11-01", "2027-01-01", "2026-12-01", "ACTIVE")).toContain("COMPLETED");
    expect(checkProjectDates("2026-11-01", "2027-01-01", "2026-12-01", "COMPLETED")).toBeNull();
  });
  it("requires project ID when creating site", () => {
    expect(createSiteSchema.safeParse({ name: "Site A", location: "Dhaka" }).success).toBe(false);
    expect(createSiteSchema.safeParse({ projectId: "project-1", name: "Site A", location: "Dhaka" }).success).toBe(true);
  });
  it("rejects changing a site's project ID on update", () => {
    expect(updateSiteSchema.safeParse({ expectedUpdatedAt: stamp, projectId: "other" }).success).toBe(false);
  });
  it("validates site statuses and optimistic locking", () => {
    expect(updateSiteSchema.safeParse({ expectedUpdatedAt: stamp, status: "ACTIVE" }).success).toBe(true);
    expect(updateSiteSchema.safeParse({ expectedUpdatedAt: stamp, status: "REMOVED" }).success).toBe(false);
    expect(updateSiteSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
  });
  it("requires optimistic locking for archives", () => {
    expect(archiveSchema.safeParse({}).success).toBe(false);
    expect(archiveSchema.safeParse({ expectedUpdatedAt: stamp }).success).toBe(true);
  });
});
