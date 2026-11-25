import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "./policy";
import { deriveOperationalGrants, siteAssignmentKey } from "./role-grants";

/**
 * Explicit active organization is mandatory. No first-membership fallback.
 * Better Auth's set-active operation must be used when a login has no active org.
 * Always call per request; revoking a DB grant must immediately remove access.
 */
export async function resolveAuthorizationContext(requestHeaders: Headers): Promise<AuthorizationContext | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user.emailVerified) return null;

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return null;

  // Both session identity and selected organization MUST match the same active Member.
  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!member || member.disabledAt !== null) return null;

  const now = new Date();
  const [roleRows, projectMembers, siteAssignments, contractorUser] = await Promise.all([
    prisma.operationalRoleAssignment.findMany({
      where: {
        organizationId, membershipId: member.id, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { organizationId: true, role: true, scope: true, projectId: true,
        siteId: true, revokedAt: true, expiresAt: true },
    }),
    prisma.projectMember.findMany({
      where: { organizationId, membershipId: member.id, leftAt: null, project: { is: { archivedAt: null } } },
      select: { projectId: true },
    }),
    prisma.siteAssignment.findMany({
      where: {
        organizationId, membershipId: member.id, endedAt: null,
        projectMember: { is: { leftAt: null, project: { is: { archivedAt: null } } } },
        site: { is: { archivedAt: null } },
      },
      select: { projectId: true, siteId: true },
    }),
    prisma.contractorUser.findFirst({
      where: { organizationId, membershipId: member.id, endedAt: null,
        company: { is: { status: "ACTIVE" } } },
      select: { contractorId: true },
    }),
  ]);

  const contractorProjects = contractorUser
    ? await prisma.projectContractorAssignment.findMany({
        where: { organizationId, contractorId: contractorUser.contractorId, endedAt: null,
          project: { is: { archivedAt: null } } },
        select: { projectId: true },
      })
    : [];

  const grants = deriveOperationalGrants(organizationId, roleRows, {
    activeProjectIds: new Set(projectMembers.map((row) => row.projectId)),
    activeSiteKeys: new Set(siteAssignments.map((row) => siteAssignmentKey(row.projectId, row.siteId))),
    activeContractorProjectIds: new Set(contractorProjects.map((row) => row.projectId)),
  }, now);

  return {
    organizationId,
    membershipId: member.id,
    membershipActive: true,
    emailVerified: true,
    betterAuthRole: member.role,
    grants,
  };
}
