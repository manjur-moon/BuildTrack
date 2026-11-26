import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey, parseEntityId } from "@/server/construction/request";
import { usageInput } from "@/server/inventory/input";
import { consumeIssued } from "@/server/inventory/usage";
type RouteContext = { params: Promise<{ issueItemId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const { issueItemId } = await context.params;
    const input = await parseJson(request, usageInput);
    return ok(await consumeIssued(actor, parseEntityId(issueItemId), input, key, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
