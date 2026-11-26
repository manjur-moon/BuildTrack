import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { updateTaskSchema } from "@/server/construction/task-input";
import { getTask, updateTask } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await getTask(actor, parseEntityId((await params).taskId)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, updateTaskSchema);
    return ok(await updateTask(actor, parseEntityId((await params).taskId), input, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
