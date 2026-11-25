import { describe, expect, it } from "vitest";
import { assertSameOrigin, parseEntityId, requiredIdempotencyKey } from "@/server/construction/request";

describe("Step 8 request protection", () => {
  it("requires same-origin mutation", () => {
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/v1/projects", {
      headers: { Origin: "http://localhost:3000" },
    }))).not.toThrow();
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/v1/projects", {
      headers: { Origin: "https://attacker.invalid" },
    }))).toThrow();
    expect(() => assertSameOrigin(new Request("http://localhost:3000/api/v1/projects"))).toThrow();
  });
  it("requires durable create keys", () => {
    expect(requiredIdempotencyKey(new Headers({ "Idempotency-Key": "uuid_12345678" }))).toBe("uuid_12345678");
    expect(() => requiredIdempotencyKey(new Headers())).toThrow();
    expect(() => requiredIdempotencyKey(new Headers({ "Idempotency-Key": "bad key" }))).toThrow();
  });
  it("refuses empty or oversize route IDs", () => {
    expect(() => parseEntityId("")).toThrow();
    expect(() => parseEntityId("x".repeat(129))).toThrow();
  });
});
