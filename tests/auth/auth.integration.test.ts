import { describe, it, expect } from "vitest";
import { config as loadDotEnv } from "dotenv";

const run = process.env.RUN_AUTH_INTEGRATION === "1";

if (run) {
  // Load auth settings without overriding the selected test database.
  const result = loadDotEnv({
    path: ".env",
    override: false,
  });

  if (result.error) {
    throw new Error("Unable to load integration test environment");
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing");
  }

  const target = new URL(databaseUrl);

  if (
    target.pathname !== "/buildtrack_auth_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.port !== "5433"
  ) {
    throw new Error(
      "Integration tests must use the isolated buildtrack_auth_test database."
    );
  }
}

describe.skipIf(!run)("Better Auth real PostgreSQL integration", () => {
  it("rejects direct public sign-up without server-issued authorization", async () => {
    const { auth } = await import("../../src/server/auth/auth");
    const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ name: "Unauthorized", email: `no-invite-${Date.now()}@example.com`, password: "very-secure-password-2026" }),
    });
    const response = await auth.handler(request);
    expect(response.status).toBe(403);
  });
  it("rejects role injection through direct organization invitation API", async () => {
    const { auth } = await import("../../src/server/auth/auth");
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/organization/invite-member", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ organizationId: "ignored", email: "test@example.com", role: "owner" }),
    }));
    expect(response.status).toBe(403);
  });
  it("does not create a session for invalid credentials", async () => {
    const { auth } = await import("../../src/server/auth/auth");
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "invalid@example.com", password: "incorrect-password-123" }),
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
  });
});
