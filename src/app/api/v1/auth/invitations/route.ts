import { NextRequest } from "next/server";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { parseJson } from "@/server/api/validation";
import { errorResponse, ok } from "@/server/api/response";
import { inviteMemberSchema } from "@/server/auth/registration-schema";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user.emailVerified) throw new ApiError(401, "UNAUTHENTICATED", "Sign in with a verified email.");
    const member = await prisma.member.findFirst({
      where: { userId: session.user.id, disabledAt: null, role: "owner" },
      select: { organizationId: true },
    });
    if (!member) throw new ApiError(403, "FORBIDDEN", "Only the organization owner can issue invitations in Step 5.");
    const parsed = await parseJson(request, inviteMemberSchema);
    // Better Auth performs its own permission check and creates the invitation.
    let invitation: { id: string };
    try {
      invitation = await auth.api.createInvitation({
        body: {
          email: parsed.email,
          role: "member",
          organizationId: member.organizationId,
          
        },
        headers: request.headers,
      });
    } catch {
      throw new ApiError(409, "CONFLICT", "Invitation could not be issued. Confirm the email, membership and SMTP settings.");
    }
    return ok({ invitationId: invitation.id, status: "pending" }, { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
