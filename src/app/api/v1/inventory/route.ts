import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseList } from "@/server/inventory/input";
import { ApiError } from "@/server/api/errors";
import { listStock } from "@/server/inventory/stock";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { siteId, page, limit, q } = parseList(request.nextUrl.searchParams);
    if (!siteId) throw new ApiError(422, "VALIDATION_ERROR", "siteId is required");
    return ok(await listStock(actor, siteId, page, limit, q), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
