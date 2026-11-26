import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { updateTaskProgressSchema } from "@/server/construction/task-input";
import { updateTaskProgress } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };
export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, updateTaskProgressSchema);
    return ok(await updateTaskProgress(actor, parseEntityId((await params).taskId), input, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
