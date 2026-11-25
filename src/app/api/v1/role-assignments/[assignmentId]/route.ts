import type { NextRequest } from "next/server";
import { ApiError } from "@/server/api/errors";
import { errorResponse, ok } from "@/server/api/response";
import { revokeOperationalRole } from "@/server/rbac/manage-roles";
import { requireAuthorizationContext } from "@/server/rbac/require";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ assignmentId: string }> };

export async function DELETE(request: NextRequest, route: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { assignmentId } = await route.params;
    if (!assignmentId || assignmentId.length > 128) {
      throw new ApiError(404, "NOT_FOUND", "Role assignment not found.");
    }
    const result = await revokeOperationalRole(actor, assignmentId, requestId);
    return ok(result, { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
