import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, parseEntityId } from "@/server/construction/request";
import { deleteMedia } from "@/server/media/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ mediaId: string }> };
export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await deleteMedia(actor, parseEntityId((await params).mediaId), requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
