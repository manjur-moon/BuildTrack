import { describe, expect, it } from "vitest";
import { createInternalSignupProof, verifyInternalSignupProof } from "../../src/server/auth/internal-proof";

const secret = "this-is-a-test-secret-with-enough-entropy-000000";
const now = 1_800_000_000_000;

describe("server-only signup authorization", () => {
  it("accepts valid proof and normalized email", () => {
    const proof = createInternalSignupProof("EXAMPLE@BUILDTRACK.TEST", "invitation-signup", secret, now);
    expect(verifyInternalSignupProof(proof, "example@buildtrack.test", secret, now + 1000)).toBe("invitation-signup");
  });
  it("rejects forged and mismatched proofs", () => {
    const proof = createInternalSignupProof("invitee@example.com", "invitation-signup", secret, now);
    expect(verifyInternalSignupProof(proof, "other@example.com", secret, now)).toBeNull();
    expect(verifyInternalSignupProof(proof.slice(0, -2) + "zz", "invitee@example.com", secret, now)).toBeNull();
    expect(verifyInternalSignupProof(proof, "invitee@example.com", "wrong".repeat(10), now)).toBeNull();
  });
  it("rejects replay after expiry and malformed proofs", () => {
    const proof = createInternalSignupProof("invitee@example.com", "invitation-signup", secret, now);
    expect(verifyInternalSignupProof(proof, "invitee@example.com", secret, now + 61_000)).toBeNull();
    expect(verifyInternalSignupProof("garbage", "invitee@example.com", secret, now)).toBeNull();
    expect(verifyInternalSignupProof(null, "invitee@example.com", secret, now)).toBeNull();
  });
  it("distinguishes the restricted local bootstrap purpose", () => {
    const proof = createInternalSignupProof("admin@example.com", "development-bootstrap", secret, now);
    expect(verifyInternalSignupProof(proof, "admin@example.com", secret, now)).toBe("development-bootstrap");
  });
});
