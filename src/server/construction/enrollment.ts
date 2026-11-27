import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { canManageStaffEnrollment, type EnrollStaffInput } from "./enrollment-input";
import { idempotentCreate } from "./idempotency";
import { lockProjectRow, requireLiveProjectLock, lockSiteRow } from "./locking";

/**
 * Organizational onboarding is an owner-only administrative operation.
 * Assignments and scoped role grants are committed atomically so Step 6's
 * live-grant resolver never sees an intentional half-assigned role.
 */
export function assertEnrollmentOwner(actor: AuthorizationContext) {
  if (!canManageStaffEnrollment(actor)) {
    throw new ApiError(403, "FORBIDDEN", "Only the organization owner may manage staff assignments.");
  }
}

function transactionConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error &&
    (error.code === "P2002" || error.code === "P2034")) {
    throw new ApiError(409, "CONFLICT", "Assignment changed concurrently or already exists. Refresh and retry.");
  }
  throw error;
}

export async function getEnrollmentWorkspace(actor: AuthorizationContext) {
  assertEnrollmentOwner(actor);
  const owner = await prisma.member.findFirst({ where: {
    id: actor.membershipId, organizationId: actor.organizationId, disabledAt: null, role: "owner",
  }, select: { id: true } });
  if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner membership is no longer active.");

  const now = new Date();
  const [memberRows, projects, sites, grantRows] = await Promise.all([
    prisma.member.findMany({ where: { organizationId: actor.organizationId, disabledAt: null,
      user: { is: { emailVerified: true } } }, select: {
      id: true, role: true, user: { select: { name: true, email: true } },
    }, orderBy: { createdAt: "asc" }, take: 101 }),
    prisma.project.findMany({ where: { organizationId: actor.organizationId, archivedAt: null,
      status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } },
      select: { id: true, name: true, code: true, managerMembershipId: true },
      orderBy: { createdAt: "desc" }, take: 101 }),
    prisma.constructionSite.findMany({ where: { organizationId: actor.organizationId, archivedAt: null, status: { not: "CLOSED" },
      project: { is: { archivedAt: null, status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } } } },
      select: { id: true, projectId: true, name: true },
      orderBy: { createdAt: "desc" }, take: 101 }),
    prisma.operationalRoleAssignment.findMany({ where: { organizationId: actor.organizationId,
      revokedAt: null, role: { in: ["PROJECT_MANAGER", "SITE_ENGINEER"] },
    }, select: { id: true, role: true, membershipId: true, projectId: true, siteId: true, expiresAt: true },
    orderBy: { grantedAt: "desc" }, take: 201 }),
  ]);
  return {
    members: memberRows.slice(0, 100).map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, organizationRole: m.role })),
    projects: projects.slice(0, 100), sites: sites.slice(0, 100),
    assignments: grantRows.slice(0, 200).map((g) => ({ ...g,
      expired: g.expiresAt !== null && g.expiresAt <= now })),
    truncated: { members: memberRows.length > 100, projects: projects.length > 100,
      sites: sites.length > 100, assignments: grantRows.length > 200 },
  };
}

export async function enrollStaff(
  actor: AuthorizationContext, input: EnrollStaffInput, requestId: string, key: string,
) {
  assertEnrollmentOwner(actor);
  if (actor.membershipId === input.membershipId) {
    throw new ApiError(403, "FORBIDDEN", "Owners cannot grant operational roles to themselves.");
  }
  try {
    return await idempotentCreate(actor, "construction.staff.enroll", key, input, async (tx, id) => {
      const owner = await tx.member.findFirst({ where: { id: actor.membershipId,
        organizationId: actor.organizationId, role: "owner", disabledAt: null,
        user: { is: { emailVerified: true } } }, select: { id: true } });
      if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner permission was revoked.");
      const grant = await tx.operationalRoleAssignment.findFirst({ where: {
        id, organizationId: actor.organizationId, membershipId: input.membershipId,
        role: input.role, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      }, select: { id: true } });
      if (!grant) throw new ApiError(409, "CONFLICT", "Original staff assignment is no longer active.");
    }, async (tx) => {
      const owner = await tx.member.findFirst({ where: { id: actor.membershipId,
        organizationId: actor.organizationId, role: "owner", disabledAt: null }, select: { id: true } });
      if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner permission was revoked.");
      const subject = await tx.member.findFirst({ where: { id: input.membershipId,
        organizationId: actor.organizationId, disabledAt: null,
        user: { is: { emailVerified: true } } }, select: { id: true, role: true } });
      if (!subject) throw new ApiError(404, "NOT_FOUND", "Verified active member not found in this organization.");
      if (subject.role === "owner") throw new ApiError(403, "FORBIDDEN", "An organization owner does not need an operational staff assignment.");

      let projectId: string;
      let siteId: string | null = null;
      if (input.role === "PROJECT_MANAGER") {
        // One shared Project lock coordinates concurrent PM grants and archives.
        await requireLiveProjectLock(tx, actor.organizationId, input.projectId);
        const project = await tx.project.findFirst({ where: { id: input.projectId,
          organizationId: actor.organizationId, archivedAt: null,
          status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } },
          select: { id: true, managerMembershipId: true } });
        if (!project) throw new ApiError(404, "NOT_FOUND", "Active project not found.");
        if (project.managerMembershipId && project.managerMembershipId !== subject.id) {
          throw new ApiError(409, "CONFLICT", "A lead project manager is already assigned. Revoke them first.");
        }
        projectId = project.id;
      } else {
        // Read only the immutable projectId before acquiring locks in order.
        const preliminarySite = await tx.constructionSite.findFirst({ where: {
          id: input.siteId, organizationId: actor.organizationId,
        }, select: { projectId: true } });
        if (!preliminarySite) throw new ApiError(404, "NOT_FOUND", "Active construction site not found.");
        await requireLiveProjectLock(tx, actor.organizationId, preliminarySite.projectId);
        const siteLock = await lockSiteRow(tx, actor.organizationId, preliminarySite.projectId, input.siteId);
        if (!siteLock || siteLock.archivedAt || siteLock.status === "CLOSED") {
          throw new ApiError(409, "CONFLICT", "Site is closed or archived. Refresh and retry.");
        }
        const site = await tx.constructionSite.findFirst({ where: { id: input.siteId,
          organizationId: actor.organizationId, archivedAt: null,
          project: { is: { archivedAt: null, status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } } } },
          select: { id: true, projectId: true, status: true } });
        if (!site) throw new ApiError(404, "NOT_FOUND", "Active construction site not found.");
        if (site.status === "CLOSED") throw new ApiError(409, "CONFLICT", "Cannot assign staff to a closed site.");
        siteId = site.id;
        projectId = site.projectId;
      }

      const existing = await tx.operationalRoleAssignment.findFirst({ where: {
        organizationId: actor.organizationId, membershipId: subject.id,
        role: input.role, scope: input.role === "PROJECT_MANAGER" ? "PROJECT" : "SITE",
        projectId, siteId, revokedAt: null,
      }, select: { id: true } });
      if (existing) throw new ApiError(409, "CONFLICT", "This operational assignment already exists.");

      // Existing composite-unique ProjectMember and SiteAssignment records are
      // reactivated; no duplicate enrollment rows are created.
      await tx.projectMember.upsert({ where: { organizationId_projectId_membershipId: {
        organizationId: actor.organizationId, projectId, membershipId: subject.id,
      } }, create: { organizationId: actor.organizationId, projectId, membershipId: subject.id },
      update: { leftAt: null } });

      if (siteId) {
        // Lock the live site row: a concurrent archive/close must not silently
        // race with a fresh staff enrollment.
        const siteLocked = await tx.constructionSite.updateMany({ where: {
          id: siteId, projectId, organizationId: actor.organizationId,
          archivedAt: null, status: { not: "CLOSED" },
          project: { is: { archivedAt: null, status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } } },
        }, data: { updatedAt: new Date() } });
        if (siteLocked.count !== 1) throw new ApiError(409, "CONFLICT", "Site was closed or archived. Refresh and retry.");
        await tx.siteAssignment.upsert({ where: { organizationId_siteId_membershipId: {
          organizationId: actor.organizationId, siteId, membershipId: subject.id,
        } }, create: { organizationId: actor.organizationId, projectId, siteId,
          membershipId: subject.id }, update: { endedAt: null } });
      } else {
        // Conditional update enforces one lead PM, including concurrent writes.
        const changed = await tx.project.updateMany({ where: { id: projectId,
          organizationId: actor.organizationId, archivedAt: null,
          status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] },
          OR: [{ managerMembershipId: null }, { managerMembershipId: subject.id }],
        }, data: { managerMembershipId: subject.id } });
        if (changed.count !== 1) throw new ApiError(409, "CONFLICT", "Project manager changed. Refresh and retry.");
      }

      const grant = await tx.operationalRoleAssignment.create({ data: {
        organizationId: actor.organizationId, membershipId: subject.id,
        grantedByMembershipId: owner.id, role: input.role,
        scope: siteId ? "SITE" : "PROJECT", projectId, siteId,
      }, select: { id: true, role: true, membershipId: true, projectId: true, siteId: true } });
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId,
        actorMembershipId: owner.id, action: "construction.staff.enrolled",
        resourceType: "OperationalRoleAssignment", resourceId: grant.id, requestId,
        after: { membershipId: subject.id, role: input.role, projectId, siteId },
      } });
      return grant;
    });
  } catch (error) { transactionConflict(error); }
}

/**
 * Revoke the scoped operational grant, deactivate its dependent site assignment,
 * and end ProjectMember only if no other live project/site roles require it.
 * Never hard-delete a historical enrollment or audit event.
 */
export async function revokeStaffEnrollment(actor: AuthorizationContext, grantId: string, requestId: string) {
  assertEnrollmentOwner(actor);
  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await tx.member.findFirst({ where: { id: actor.membershipId,
        organizationId: actor.organizationId, role: "owner", disabledAt: null }, select: { id: true } });
      if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner permission was revoked.");
      const grant = await tx.operationalRoleAssignment.findFirst({ where: { id: grantId,
        organizationId: actor.organizationId, revokedAt: null,
        role: { in: ["PROJECT_MANAGER", "SITE_ENGINEER"] } },
        select: { id: true, role: true, membershipId: true, projectId: true, siteId: true } });
      if (!grant || !grant.projectId) throw new ApiError(404, "NOT_FOUND", "Active staff assignment not found.");
      // Project → Site lock order is shared with create/archive/enroll. An
      // archive cannot slip between the revocation checks and membership writes.
      const projectLock = await lockProjectRow(tx, actor.organizationId, grant.projectId);
      if (!projectLock) throw new ApiError(404, "NOT_FOUND", "Project not found.");
      if (grant.siteId) {
        const siteLock = await lockSiteRow(tx, actor.organizationId, grant.projectId, grant.siteId);
        if (!siteLock) throw new ApiError(404, "NOT_FOUND", "Site not found.");
      }
      // Reject revocation while this member has unfinished, nonarchived tasks
      // in the exact scope being removed. Never silently orphan the assignee.
      const unfinishedTaskAssignments = await tx.taskAssignment.count({ where: {
        organizationId: actor.organizationId,
        projectId: grant.projectId,
        membershipId: grant.membershipId,
        unassignedAt: null,
        task: { is: {
          archivedAt: null,
          status: { not: "COMPLETED" },
          ...(grant.role === "SITE_ENGINEER" ? { siteId: grant.siteId } : {}),
        } },
      } });
      if (unfinishedTaskAssignments > 0) {
        throw new ApiError(409, "CONFLICT",
          `Cannot revoke: ${unfinishedTaskAssignments} open task assignment(s) require reassignment or completion.`);
      }
      const now = new Date();
      const changed = await tx.operationalRoleAssignment.updateMany({ where: { id: grant.id,
        organizationId: actor.organizationId, revokedAt: null },
      data: { revokedAt: now, revokedByMembershipId: owner.id } });
      if (changed.count !== 1) throw new ApiError(409, "CONFLICT", "Assignment changed. Refresh and retry.");
      if (grant.role === "PROJECT_MANAGER") {
        await tx.project.updateMany({ where: { id: grant.projectId,
          organizationId: actor.organizationId, managerMembershipId: grant.membershipId },
          data: { managerMembershipId: null } });
      } else if (grant.siteId) {
        await tx.siteAssignment.updateMany({ where: { organizationId: actor.organizationId,
          projectId: grant.projectId, siteId: grant.siteId,
          membershipId: grant.membershipId, endedAt: null }, data: { endedAt: now } });
      }
      // The member may still be assigned to another site or have a project-level
      // role. Do not revoke that membership and indirectly remove other access.
      const [remainingGrants, remainingSites] = await Promise.all([
        tx.operationalRoleAssignment.count({ where: { organizationId: actor.organizationId,
          membershipId: grant.membershipId, projectId: grant.projectId, revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        } }),
        tx.siteAssignment.count({ where: { organizationId: actor.organizationId,
          membershipId: grant.membershipId, projectId: grant.projectId, endedAt: null } }),
      ]);
      if (remainingGrants === 0 && remainingSites === 0) {
        await tx.projectMember.updateMany({ where: { organizationId: actor.organizationId,
          membershipId: grant.membershipId, projectId: grant.projectId, leftAt: null },
        data: { leftAt: now } });
      }
      await tx.auditEvent.create({ data: { organizationId: actor.organizationId,
        actorMembershipId: owner.id, action: "construction.staff.revoked",
        resourceType: "OperationalRoleAssignment", resourceId: grant.id, requestId,
        before: { membershipId: grant.membershipId, role: grant.role,
          projectId: grant.projectId, siteId: grant.siteId }, after: { revoked: true },
      } });
      return { assignmentId: grant.id, revoked: true };
    }, { isolationLevel: "Serializable" });
  } catch (error) { transactionConflict(error); }
}
