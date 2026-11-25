import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { revokeStaffEnrollment } from "@/server/construction/enrollment";

export const runtime = "nodejs";
type Context = { params: Promise<{ grantId: string }> };

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const id = parseEntityId((await params).grantId);
    return ok(await revokeStaffEnrollment(actor, id, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
