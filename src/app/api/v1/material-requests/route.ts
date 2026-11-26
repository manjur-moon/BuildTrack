import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { parseList } from "@/server/inventory/input";
import { ApiError } from "@/server/api/errors";
import { requestInput } from "@/server/inventory/input";
import { listRequests, createRequest } from "@/server/inventory/requisitions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { siteId, page, limit, status } = parseList(request.nextUrl.searchParams);
    if (!siteId) throw new ApiError(422, "VALIDATION_ERROR", "siteId is required");
    return ok(await listRequests(actor, siteId, page, limit, status), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, requestInput);
    return ok(await createRequest(actor, input, key, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
