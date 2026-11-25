import { describe, expect, it } from "vitest";
import { inviteMemberSchema, registerWithInvitationSchema } from "../../src/server/auth/registration-schema";

describe("invitation-only registration validation", () => {
  const valid = { invitationId: "inv_12345678", proof: "abcdefghijklmnopqrstuvwxyz1234567890", name: "Site Engineer", password: "secure-passphrase-value" };
  it("accepts valid registration and rejects short passwords", () => {
    expect(registerWithInvitationSchema.safeParse(valid).success).toBe(true);
    expect(registerWithInvitationSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
  it("rejects role injection and forged email fields", () => {
    expect(registerWithInvitationSchema.safeParse({ ...valid, role: "owner" }).success).toBe(false);
    expect(registerWithInvitationSchema.safeParse({ ...valid, email: "attacker@example.com" }).success).toBe(false);
  });
  it("only permits a basic member role in Step 5", () => {
    expect(inviteMemberSchema.parse({ email: "Example@Example.com" })).toEqual({ email: "example@example.com", role: "member" });
    expect(inviteMemberSchema.safeParse({ email: "a@example.com", role: "owner" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: "a@example.com", role: "admin " }).success).toBe(false);
  });
});
