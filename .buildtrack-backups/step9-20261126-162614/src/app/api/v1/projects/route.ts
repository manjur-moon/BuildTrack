import type { NextRequest } from "next/server";
import { parsePagination } from "@/server/api/pagination";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { createProjectSchema } from "@/server/construction/input";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { listProjects, createProject } from "@/server/construction/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { page, limit } = parsePagination(request.nextUrl.searchParams);
    return ok(await listProjects(actor, page, limit), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, createProjectSchema);
    return ok(await createProject(actor, input, requestId, key), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
