import { NextRequest } from "next/server";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import { ok, errorResponse } from "@/server/api/response";
import { ApiError } from "@/server/api/errors";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
    const memberships = await prisma.member.findMany({ where: { userId: session.user.id, disabledAt: null }, select: {
      id: true, organizationId: true, role: true, organization: { select: { name: true } },
    } });
    return ok({ user: { id: session.user.id, name: session.user.name, email: session.user.email, emailVerified: session.user.emailVerified }, memberships }, { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
