import type { NextRequest } from "next/server";
import { ok, errorResponse } from "@/server/api/response";
import { parseInput, parseJson } from "@/server/api/validation";
import { ApiError } from "@/server/api/errors";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin } from "@/server/construction/request";
import { inboxQuery, inboxMutation } from "@/server/notifications/input";
import { listNotifications, mutateNotifications } from "@/server/notifications/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const params = request.nextUrl.searchParams;
    for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ApiError(422, "VALIDATION_ERROR", "Duplicate query parameter.");
    return ok(await listNotifications(actor, parseInput(inboxQuery, Object.fromEntries(params))), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    return ok(await mutateNotifications(actor, await parseJson(request, inboxMutation)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
