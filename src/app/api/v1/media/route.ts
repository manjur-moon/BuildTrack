import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { parseListMediaQuery } from "@/server/media/input";
import { listMedia } from "@/server/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await listMedia(actor, parseListMediaQuery(request.nextUrl.searchParams)), { requestId });
  } catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[MEDIA_DEBUG]", {
      requestId,
      name: error instanceof Error ? error.name : typeof error,
      code:
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : undefined,
      message: error instanceof Error ? error.message : undefined,
    });
  }

  return errorResponse(error, requestId);
}
}
