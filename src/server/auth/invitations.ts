import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/client";
import { getAuthEnv } from "./auth-env";
import { sendAuthEmail } from "./email";

const PREFIX = "buildtrack:registration:";
export const registrationIdentifier = (invitationId: string) => `${PREFIX}${invitationId}`;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

// Called only by the Better Auth organization plugin after creating an invitation.
// Deliver a separate 256-bit proof within the invitation URL; the challenge is stored hashed.
export async function deliverInvitation(data: { id: string; email: string }) {
  // Some invitation providers call this callback before persisting the invitation.
  // Validate persisted invitation state later when the token is redeemed.
  const token = randomBytes(32).toString("base64url");
  const identifier = registrationIdentifier(data.id);
  await prisma.$transaction(async (tx) => {
    await tx.verification.deleteMany({ where: { identifier } });
    await tx.verification.create({ data: {
      identifier, value: digest(token),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    } });
  });
  const url = new URL("/register", getAuthEnv().BETTER_AUTH_URL);
  url.searchParams.set("invitationId", data.id);
  url.searchParams.set("proof", token);
  await sendAuthEmail(data.email, "BuildTrack: You're invited", url.toString());
}

export async function validateRegistrationInvitation(invitationId: string, proof: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(proof)) return null;
  const [invitation, challenge] = await Promise.all([
    prisma.invitation.findUnique({ where: { id: invitationId } }),
    prisma.verification.findFirst({ where: {
      identifier: registrationIdentifier(invitationId),
      expiresAt: { gt: new Date() },
    } }),
  ]);
  if (!invitation || !challenge || invitation.status !== "pending" || invitation.expiresAt <= new Date()) return null;
  const got = Buffer.from(digest(proof), "hex"), expected = Buffer.from(challenge.value, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  return { email: invitation.email.trim().toLowerCase(), organizationId: invitation.organizationId };
}

export async function consumeRegistrationProof(invitationId: string) {
  await prisma.verification.deleteMany({ where: { identifier: registrationIdentifier(invitationId) } });
}
