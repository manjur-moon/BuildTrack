import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { taskAssigneeSchema } from "@/server/construction/task-input";
import { listTaskAssigneeCandidates, assignTask } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await listTaskAssigneeCandidates(actor, parseEntityId((await params).taskId)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, taskAssigneeSchema);
    return ok(await assignTask(actor, parseEntityId((await params).taskId), input.membershipId, requestId),
      { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
