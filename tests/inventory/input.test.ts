import { describe, expect, it } from "vitest";
import { categoryInput, materialInput, movementInput, requestInput, decisionInput,
  toMilli, fromMilli, parseList } from "@/server/inventory/input";

describe("Step 12 — inventory input and exact decimal arithmetic", () => {
  it("converts signed milliquantities without IEEE-754 arithmetic", () => {
    expect(toMilli("1.001")).toBe(1001n);
    expect(toMilli("0.125")).toBe(125n);
    expect(fromMilli(-1550n)).toBe("-1.550");
    expect(toMilli("-1.250")).toBe(-1250n);
    expect(toMilli("-0.001")).toBe(-1n);
    expect(toMilli("-0.000")).toBe(0n);
    expect(fromMilli(toMilli("-999999999999.999"))).toBe("-999999999999.999");
    expect(fromMilli(toMilli("200000000.123"))).toBe("200000000.123");
  });
  it("rejects negative, zero, exponent and >3 decimals", () => {
    for (const v of ["-1", "0", "0.000", "1e4", "1.0001", "NaN", "Infinity", "01", "", ".5", "1.", "+1", "1000000000000", "1.2.3"]) {
      expect(movementInput.safeParse({ siteId: "s1", materialId: "m1", type: "RECEIPT", quantity: v,
        reason: "Stock receipt note" }).success).toBe(false);
    }
  });
  it("rejects malformed direct decimal conversions without silent truncation", () => {
    for (const value of ["1e4", "1.0001", "1.2.3", "", "-", "NaN", " 1 "]) {
      expect(() => toMilli(value)).toThrow(RangeError);
    }
    expect(movementInput.safeParse({ siteId: "s1", materialId: "m1", type: "RECEIPT",
      quantity: "0.001", reason: "Stock receipt note" }).success).toBe(true);
  });
  it("accepts uppercase SKU, fixed units and strict material fields", () => {
    expect(materialInput.parse({ name: "Portland cement", sku: "cem-042", categoryId: "c", unit: "BAG" }).sku).toBe("CEM-042");
    expect(materialInput.safeParse({ name: "Cement", sku: "CEM 42", categoryId: "c", unit: "BAG" }).success).toBe(false);
    expect(categoryInput.safeParse({ name: "Cement", organizationId: "forged" }).success).toBe(false);
  });
  it("rejects duplicate requisition items and oversized request", () => {
    const item = { materialId: "a", quantity: "1.000" };
    expect(requestInput.safeParse({ projectId: "p", siteId: "s", reason: "For concrete casting", items: [item, item] }).success).toBe(false);
    expect(requestInput.safeParse({ projectId: "p", siteId: "s", reason: "For concrete casting", items: Array.from({ length: 26 }, (_, i) => ({ materialId: String(i), quantity: "1" })) }).success).toBe(false);
  });
  it("validates decision fields and disallows unknown properties", () => {
    expect(decisionInput.safeParse({ decision: "APPROVE", lines: [{ itemId: "a", quantityApproved: "0" }] }).success).toBe(true);
    expect(decisionInput.safeParse({ decision: "REJECT", lines: [] }).success).toBe(false);
    expect(decisionInput.safeParse({ decision: "APPROVE", reason: "foo", lines: [] }).success).toBe(false);
  });
  it("rejects malicious/duplicate query params and extreme pagination", () => {
    expect(() => parseList(new URLSearchParams("siteId=a&siteId=b"))).toThrow();
    expect(() => parseList(new URLSearchParams("page=10001"))).toThrow();
    expect(() => parseList(new URLSearchParams("orderBy=sql"))).toThrow();
    expect(parseList(new URLSearchParams("page=2&limit=10"))).toMatchObject({ page: 2, limit: 10 });
  });
});
