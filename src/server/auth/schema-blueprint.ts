/**
 * BuildTrack - Better Auth Schema Blueprint
 *
 * Used by the Better Auth CLI to generate
 * the authentication-related Prisma schema.
 *
 * BuildTrack manages Member.disabledAt through Prisma.
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },

  plugins: [
    organization({
      allowUserToCreateOrganization: false,
      requireEmailVerificationOnInvitation: true,
    }),
  ],
});