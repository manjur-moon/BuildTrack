import { describe, expect, it } from "vitest";
import { operationalGrantInputSchema, parseExpiry, scopeFields } from "../../src/server/rbac/grant-input";

const future = "2027-02-01T00:00:00.000Z";

const cases = [
  { scope: "ORGANIZATION", role: "ADMIN" },
  { scope: "ORGANIZATION", role: "FINANCE_MANAGER" },
  { scope: "PROJECT", role: "PROJECT_MANAGER", projectId: "p1" },
  { scope: "PROJECT", role: "CONTRACTOR", projectId: "p1" },
  { scope: "SITE", role: "SITE_ENGINEER", projectId: "p1", siteId: "s1" },
];

describe("Step 6C owner-managed operational grant request schema", () => {
  it("accepts only known role/scope combinations", () => {
    for (const input of cases) expect(operationalGrantInputSchema.safeParse(input).success).toBe(true);
  });
  it("rejects role escalation in the wrong scope", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "PROJECT", role: "ADMIN", projectId: "p1" }).success).toBe(false);
    expect(operationalGrantInputSchema.safeParse({ scope: "ORGANIZATION", role: "CONTRACTOR" }).success).toBe(false);
  });
  it("rejects clients supplying another organization ID", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "ORGANIZATION", role: "ADMIN", organizationId: "victim" }).success).toBe(false);
  });
  it("rejects clients supplying grantor or revocation audit metadata", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "ORGANIZATION", role: "ADMIN", grantedByMembershipId: "fake" }).success).toBe(false);
  });
  it("requires projectId for project grants", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "PROJECT", role: "PROJECT_MANAGER" }).success).toBe(false);
  });
  it("requires siteId and projectId for site grants", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "SITE", role: "SITE_ENGINEER", projectId: "p1" }).success).toBe(false);
  });
  it("rejects project fields in organization-only grants", () => {
    expect(operationalGrantInputSchema.safeParse({ scope: "ORGANIZATION", role: "ADMIN", projectId: "p1" }).success).toBe(false);
  });
  it("accepts and safely converts the expiry time", () => {
    const parsed = operationalGrantInputSchema.parse({ scope: "PROJECT", role: "PROJECT_MANAGER", projectId: "p1", expiresAt: future });
    expect(parseExpiry(parsed.expiresAt, new Date("2026-11-25T00:00:00.000Z"))?.toISOString()).toBe(future);
  });
  it("rejects elapsed or excessively long expiry windows", () => {
    const now = new Date("2026-11-25T00:00:00.000Z");
    expect(() => parseExpiry("2026-11-24T00:00:00Z", now)).toThrow();
    expect(() => parseExpiry("2030-01-01T00:00:00Z", now)).toThrow();
  });
  it("derives nullable site/project scope fields without trusting client org", () => {
    expect(scopeFields({ scope: "ORGANIZATION", role: "ADMIN" })).toEqual({ projectId: null, siteId: null });
    expect(scopeFields({ scope: "SITE", role: "SITE_ENGINEER", projectId: "p1", siteId: "s1" }))
      .toEqual({ projectId: "p1", siteId: "s1" });
  });
});
