import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey, parseEntityId } from "@/server/construction/request";
import { issueInput } from "@/server/inventory/input";
import { issueRequest } from "@/server/inventory/requisitions";
type RouteContext = { params: Promise<{ requestId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const { requestId: id } = await context.params;
    const input = await parseJson(request, issueInput);
    return ok(await issueRequest(actor, parseEntityId(id), input, key, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
