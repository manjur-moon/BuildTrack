import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";
import { hasPermission, type AuthorizationContext, type Permission, type Resource } from "@/server/rbac/policy";

type AccessTx = Pick<typeof prisma, "member" | "operationalRoleAssignment" | "projectMember" | "siteAssignment">;

/** Recheck membership, grant, and assignment INSIDE the mutation transaction. */
export async function assertCurrentWriteAccess(tx: AccessTx, actor: AuthorizationContext, permission: Permission, resource: Resource) {
  if (!hasPermission(actor, permission, resource)) throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  const member = await tx.member.findFirst({
    where: { id: actor.membershipId, organizationId: actor.organizationId, disabledAt: null },
    select: { role: true },
  });
  if (!member) throw new ApiError(403, "FORBIDDEN", "Membership is no longer active.");
  if (member.role === "owner" && actor.betterAuthRole === "owner") return;

  const now = new Date();
  for (const grant of actor.grants) {
    if (!hasPermission({ ...actor, betterAuthRole: "member", grants: [grant] }, permission, resource)) continue;
    const scope = grant.scope.toUpperCase() as "ORGANIZATION" | "PROJECT" | "SITE";
    const stored = await tx.operationalRoleAssignment.findFirst({
      where: {
        organizationId: actor.organizationId, membershipId: actor.membershipId,
        role: grant.role, scope, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        projectId: grant.scope === "organization" ? null : grant.projectId,
        siteId: grant.scope === "site" ? grant.siteId : null,
      },
      select: { id: true },
    });
    if (!stored) continue;
    if (grant.scope === "organization") return;
    const pm = await tx.projectMember.findFirst({
      where: { organizationId: actor.organizationId, projectId: grant.projectId, membershipId: actor.membershipId,
        leftAt: null, project: { is: { archivedAt: null } } }, select: { id: true },
    });
    if (!pm) continue;
    if (grant.scope === "project") return;
    const site = await tx.siteAssignment.findFirst({
      where: { organizationId: actor.organizationId, projectId: grant.projectId, siteId: grant.siteId,
        membershipId: actor.membershipId, endedAt: null, site: { is: { archivedAt: null } } },
      select: { id: true },
    });
    if (site) return;
  }
  throw new ApiError(403, "FORBIDDEN", "Operational access was revoked or expired.");
}
