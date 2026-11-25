import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { archiveSchema } from "@/server/construction/input";
import { parseEntityId, assertSameOrigin } from "@/server/construction/request";
import { archiveSite } from "@/server/construction/sites";

export const runtime = "nodejs";
type Context = { params: Promise<{ siteId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const { expectedUpdatedAt } = await parseJson(request, archiveSchema);
    return ok(await archiveSite(actor, parseEntityId((await params).siteId), expectedUpdatedAt, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
