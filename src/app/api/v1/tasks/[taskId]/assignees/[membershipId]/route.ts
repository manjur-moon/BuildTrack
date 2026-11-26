import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { unassignTask } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string; membershipId: string }> };
export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const p = await params;
    return ok(await unassignTask(actor, parseEntityId(p.taskId), parseEntityId(p.membershipId), requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
