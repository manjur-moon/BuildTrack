import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { parseList } from "@/server/inventory/input";
import { materialInput } from "@/server/inventory/input";
import { listCatalog, createMaterial } from "@/server/inventory/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { q, page, limit } = parseList(request.nextUrl.searchParams);
    return ok(await listCatalog(actor, q, page, limit), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertSameOrigin(request);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, materialInput);
    return ok(await createMaterial(actor, input, key, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
