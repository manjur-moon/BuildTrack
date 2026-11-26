import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { completeMediaSchema } from "@/server/media/input";
import { completeMediaUpload } from "@/server/media/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ mediaId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    await parseJson(request, completeMediaSchema);
    return ok(await completeMediaUpload(actor, parseEntityId((await params).mediaId), requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
