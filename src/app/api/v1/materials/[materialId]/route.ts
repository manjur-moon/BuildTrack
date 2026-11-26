import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey, parseEntityId } from "@/server/construction/request";
import { editMaterialInput } from "@/server/inventory/input";
import { editMaterial } from "@/server/inventory/catalog";
type RouteContext = { params: Promise<{ materialId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const { materialId } = await context.params;
    const input = await parseJson(request, editMaterialInput);
    return ok(await editMaterial(actor, parseEntityId(materialId), input, key, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
