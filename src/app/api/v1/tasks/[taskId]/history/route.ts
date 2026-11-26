import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseEntityId } from "@/server/construction/request";
import { getTaskHistory } from "@/server/construction/tasks";
export const runtime = "nodejs";
type Context = { params: Promise<{ taskId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await getTaskHistory(actor, parseEntityId((await params).taskId)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
