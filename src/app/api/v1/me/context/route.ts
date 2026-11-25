import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok({
      organizationId: actor.organizationId,
      membershipId: actor.membershipId,
      betterAuthRole: actor.betterAuthRole,
      operationalGrants: actor.grants,
    }, { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
