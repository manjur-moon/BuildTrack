import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin } from "@/server/construction/request";
import { initMediaSchema } from "@/server/media/input";
import { initiateMediaUpload } from "@/server/media/service";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, initMediaSchema);
    return ok(await initiateMediaUpload(actor, input, requestId), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
