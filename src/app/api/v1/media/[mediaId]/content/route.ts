import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseEntityId } from "@/server/construction/request";
import { getPrivateMediaUrl } from "@/server/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ mediaId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const url = await getPrivateMediaUrl(actor, parseEntityId((await params).mediaId));
    return NextResponse.redirect(url, { status: 302, headers: {
      "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error, requestId); }
}
