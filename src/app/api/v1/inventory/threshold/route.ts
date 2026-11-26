import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { thresholdInput } from "@/server/inventory/input";
import { setThreshold } from "@/server/inventory/stock";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, thresholdInput);
    return ok(await setThreshold(actor, input, key, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
