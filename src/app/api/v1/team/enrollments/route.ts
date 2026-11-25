import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/api/response";
import { parseJson } from "@/server/api/validation";
import { requireAuthorizationContext } from "@/server/rbac/require";
import { assertSameOrigin, requiredIdempotencyKey } from "@/server/construction/request";
import { enrollStaffSchema } from "@/server/construction/enrollment-input";
import { enrollStaff, getEnrollmentWorkspace } from "@/server/construction/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    return ok(await getEnrollmentWorkspace(actor), { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const actor = await requireAuthorizationContext(request.headers);
    const key = requiredIdempotencyKey(request.headers);
    const input = await parseJson(request, enrollStaffSchema);
    return ok(await enrollStaff(actor, input, requestId, key), { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
