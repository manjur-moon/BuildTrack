import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { getAuthEnv } from "@/server/auth/auth-env";
import { consumeRegistrationProof, validateRegistrationInvitation } from "@/server/auth/invitations";
import { createInternalSignupProof, INTERNAL_PROOF_HEADER } from "@/server/auth/internal-proof";
import { registerWithInvitationSchema } from "@/server/auth/registration-schema";
import { errorResponse } from "@/server/api/response";
import { ApiError } from "@/server/api/errors";
import { parseJson } from "@/server/api/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { invitationId, proof, name, password } = await parseJson(request, registerWithInvitationSchema);
    const invited = await validateRegistrationInvitation(invitationId, proof);
    if (!invited) throw new ApiError(400, "VALIDATION_ERROR", "Invitation is invalid or expired.");
    const signedHeader = createInternalSignupProof(invited.email, "invitation-signup", getAuthEnv().BETTER_AUTH_SECRET);
    try {
      await auth.api.signUpEmail({
        body: { email: invited.email, name, password, callbackURL: `${getAuthEnv().BETTER_AUTH_URL}/login?verified=1&next=${encodeURIComponent(`/accept-invitation?id=${invitationId}`)}` },
        headers: new Headers({ [INTERNAL_PROOF_HEADER]: signedHeader }),
      });
    } catch {
      // Do not expose email existence or low-level authentication messages.
      throw new ApiError(409, "CONFLICT", "Registration could not be completed. If you already have an account, sign in instead.");
    }
    await consumeRegistrationProof(invitationId);
    return NextResponse.json({ data: { message: "Check your email to verify your account, then sign in and accept the invitation." }, meta: { requestId } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, requestId); }
}
