import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseTaskListQuery } from "@/server/construction/task-input";
import { getTaskSummary } from "@/server/construction/tasks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await getTaskSummary(actor, parseTaskListQuery(request.nextUrl.searchParams)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
