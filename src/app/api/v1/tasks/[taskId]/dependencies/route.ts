import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { entityIdSchema } from "@/server/construction/input";
import { listTaskDependencies, changeTaskDependency } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };
const schema = z.strictObject({ predecessorId: entityIdSchema, operation: z.enum(["add", "remove"]) });
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await listTaskDependencies(actor, parseEntityId((await params).taskId)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, schema);
    return ok(await changeTaskDependency(actor, parseEntityId((await params).taskId), input.predecessorId, input.operation, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
