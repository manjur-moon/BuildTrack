import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { parseList } from "@/server/inventory/input";
import { ApiError } from "@/server/api/errors";
import { movementInput } from "@/server/inventory/input";
import { recordMovement, listMovements } from "@/server/inventory/stock";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { siteId, page, limit } = parseList(request.nextUrl.searchParams);
    if (!siteId) throw new ApiError(422, "VALIDATION_ERROR", "siteId is required");
    return ok(await listMovements(actor, siteId, page, limit), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, movementInput);
    return ok(await recordMovement(actor, input, key, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
