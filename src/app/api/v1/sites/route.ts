import type { NextRequest } from "next/server";
import { parseSiteListQuery } from "@/server/construction/list-query";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { createSiteSchema } from "@/server/construction/input";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { listSites, createSite } from "@/server/construction/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const query = parseSiteListQuery(request.nextUrl.searchParams);
    return ok(await listSites(actor, query), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, createSiteSchema);
    return ok(await createSite(actor, input, requestId, key), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
