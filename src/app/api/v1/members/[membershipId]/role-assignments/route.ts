import type { NextRequest } from "next/server";
import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { parseJson } from "@/server/api/validation";
import { errorResponse, ok } from "@/server/api/response";
import { operationalGrantInputSchema } from "@/server/rbac/grant-input";
import { grantOperationalRole } from "@/server/rbac/manage-roles";
import { assertOwnerRoleManager, requireAuthorizationContext } from "@/server/rbac/require";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ membershipId: string }> };

export async function GET(request: NextRequest, route: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    assertOwnerRoleManager(actor);
    const { membershipId } = await route.params;
    if (!membershipId || membershipId.length > 128) throw new ApiError(404, "NOT_FOUND", "Member not found.");
    const member = await prisma.member.findFirst({
      where: { id: membershipId, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!member) throw new ApiError(404, "NOT_FOUND", "Member not found.");
    const rows = await prisma.operationalRoleAssignment.findMany({
      where: { organizationId: actor.organizationId, membershipId },
      orderBy: { grantedAt: "desc" },
      take: 101,
      select: { id: true, role: true, scope: true, projectId: true, siteId: true,
        grantedAt: true, expiresAt: true, revokedAt: true },
    });
    return ok({ membershipId, assignments: rows.slice(0, 100), truncated: rows.length > 100 }, { requestId });
  } catch (error) { return errorResponse(error, requestId); }
}

export async function POST(request: NextRequest, route: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireAuthorizationContext(request.headers);
    const { membershipId } = await route.params;
    if (!membershipId || membershipId.length > 128) throw new ApiError(404, "NOT_FOUND", "Member not found.");
    const input = await parseJson(request, operationalGrantInputSchema);
    const assignment = await grantOperationalRole(actor, membershipId, input, requestId);
    return ok(assignment, { status: 201, requestId });
  } catch (error) { return errorResponse(error, requestId); }
}
