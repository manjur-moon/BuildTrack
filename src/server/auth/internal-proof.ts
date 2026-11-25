import { createHmac, timingSafeEqual } from "node:crypto";

// Proofs are produced only by trusted server routes / local bootstrap scripts.
// Never return them to browsers, put them in an email, or write them to logs.
export type ProofPurpose = "invitation-signup" | "development-bootstrap";
const HEADER = "x-buildtrack-signup-proof";

function mac(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createInternalSignupProof(email: string, purpose: ProofPurpose, secret: string, at = Date.now()) {
  const expires = at + 60_000;
  const payload = `${purpose}.${expires}.${Buffer.from(email.trim().toLowerCase()).toString("base64url")}`;
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyInternalSignupProof(proof: string | null, email: string, secret: string, at = Date.now()): ProofPurpose | null {
  if (!proof || proof.length > 1000) return null;
  const parts = proof.split(".");
  if (parts.length !== 4) return null;
  const [purpose, until, encodedEmail, signature] = parts;
  if (purpose !== "invitation-signup" && purpose !== "development-bootstrap") return null;
  const expires = Number(until);
  if (!Number.isSafeInteger(expires) || expires <= at || expires > at + 60_001) return null;
  if (encodedEmail !== Buffer.from(email.trim().toLowerCase()).toString("base64url")) return null;
  const expected = mac(`${purpose}.${until}.${encodedEmail}`, secret);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return purpose;
}

export const INTERNAL_PROOF_HEADER = HEADER;
