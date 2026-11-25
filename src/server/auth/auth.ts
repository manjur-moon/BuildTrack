import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { prisma } from "@/server/db/client";
import { getAuthEnv } from "./auth-env";
import { deliverInvitation } from "./invitations";
import { sendAuthEmail } from "./email";
import { INTERNAL_PROOF_HEADER, verifyInternalSignupProof } from "./internal-proof";

const env = getAuthEnv();
const ONLY_SAFE_ORG_PATHS = new Set([
  "/organization/invite-member",
  "/organization/get-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/list-user-invitations",
  "/organization/set-active",
  "/organization/get-full-organization",
  "/organization/list",
]);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, window: 60, max: 20 },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail(user.email, "BuildTrack: Reset your password", url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail(user.email, "BuildTrack: Verify your email", url);
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        const purpose = verifyInternalSignupProof(ctx.headers?.get(INTERNAL_PROOF_HEADER) ?? null, email, env.BETTER_AUTH_SECRET);
        if (!purpose || (purpose === "development-bootstrap" && process.env.BUILDTRACK_BOOTSTRAP_ENABLED !== "yes")) {
          throw new APIError("FORBIDDEN", { message: "Registration is invitation-only." });
        }
      }
      if (ctx.path.startsWith("/organization/")) {
        // Until Step 6, role changes, public organization creation, and privileged
        // organization mutations are explicitly disabled even for owner accounts.
        if (!ONLY_SAFE_ORG_PATHS.has(ctx.path)) {
          throw new APIError("FORBIDDEN", { message: "Organization management is not available yet." });
        }
        if (ctx.path === "/organization/invite-member") {
          if (ctx.body?.role !== "member") {
            throw new APIError("FORBIDDEN", { message: "Invitations may only assign the member role." });
          }
          // Better Auth independently verifies invitation permission on the session.
        }
      }
    }),
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,
      requireEmailVerificationOnInvitation: true,
      invitationExpiresIn: 60 * 60 * 24 * 2,
      sendInvitationEmail: async (data) => {
        await deliverInvitation({ id: data.id, email: data.email });
      },
    }),
  ],
});
