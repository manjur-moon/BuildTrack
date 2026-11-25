import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { updateProjectSchema } from "@/server/construction/input";
import { parseEntityId, assertSameOrigin } from "@/server/construction/request";
import { getProject, updateProject } from "@/server/construction/projects";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await getProject(actor, parseEntityId((await params).projectId)), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const input = await parseJson(request, updateProjectSchema);
    return ok(await updateProject(actor, parseEntityId((await params).projectId), input, requestId), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
