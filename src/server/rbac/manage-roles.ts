import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import type { AuthorizationContext } from "./policy";
import { assertOwnerRoleManager } from "./require";
import { parseExpiry, scopeFields, type OperationalGrantInput } from "./grant-input";

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * Owner-only grant service, with live membership/assignment validation and an
 * audit event atomically committed with the grant. Prerequisite membership,
 * project and site assignments are created by separate domain workflows.
 */
export async function grantOperationalRole(
  actor: AuthorizationContext,
  subjectMembershipId: string,
  input: OperationalGrantInput,
  requestId: string,
) {
  assertOwnerRoleManager(actor);
  if (actor.membershipId === subjectMembershipId) {
    throw new ApiError(403, "FORBIDDEN", "Self-grants are not permitted.");
  }

  let expiresAt: Date | null;
  try {
    expiresAt = parseExpiry(input.expiresAt);
  } catch (error) {
    throw new ApiError(422, "VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid expiry.");
  }

  const { projectId, siteId } = scopeFields(input);
  try {
    return await prisma.$transaction(async (tx) => {
      // Revalidate the actor and membership inside the transaction: never trust
      // yesterday's role, a cookie-supplied membership, or an organization ID.
      const owner = await tx.member.findFirst({
        where: { id: actor.membershipId, organizationId: actor.organizationId,
          role: "owner", disabledAt: null },
        select: { id: true },
      });
      if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner permission has been revoked.");

      const subject = await tx.member.findFirst({
        where: { id: subjectMembershipId, organizationId: actor.organizationId, disabledAt: null },
        select: { id: true },
      });
      if (!subject) throw new ApiError(404, "NOT_FOUND", "Active member not found.");

      if (projectId) {
        const projectMember = await tx.projectMember.findFirst({
          where: { organizationId: actor.organizationId, projectId,
            membershipId: subject.id, leftAt: null,
            project: { is: { archivedAt: null } } },
          select: { id: true },
        });
        if (!projectMember) {
          throw new ApiError(422, "VALIDATION_ERROR", "Active project membership is required.");
        }
      }

      if (input.scope === "SITE") {
        const siteMember = await tx.siteAssignment.findFirst({
          where: { organizationId: actor.organizationId, projectId: input.projectId,
            siteId: input.siteId, membershipId: subject.id, endedAt: null,
            site: { is: { archivedAt: null } } },
          select: { id: true },
        });
        if (!siteMember) {
          throw new ApiError(422, "VALIDATION_ERROR", "Active assignment to the site is required.");
        }
      }

      if (input.scope === "PROJECT" && input.role === "CONTRACTOR") {
        const contractor = await tx.contractorUser.findFirst({
          where: { organizationId: actor.organizationId, membershipId: subject.id,
            endedAt: null, company: { is: { status: "ACTIVE" } } },
          select: { contractorId: true },
        });
        if (!contractor) {
          throw new ApiError(422, "VALIDATION_ERROR", "Active contractor affiliation is required.");
        }
        const assignment = await tx.projectContractorAssignment.findFirst({
          where: { organizationId: actor.organizationId,
            projectId: input.projectId, contractorId: contractor.contractorId,
            endedAt: null },
          select: { id: true },
        });
        if (!assignment) {
          throw new ApiError(422, "VALIDATION_ERROR", "Active project contract is required.");
        }
      }

      const grant = await tx.operationalRoleAssignment.create({
        data: {
          organizationId: actor.organizationId,
          membershipId: subject.id,
          grantedByMembershipId: owner.id,
          role: input.role,
          scope: input.scope,
          projectId,
          siteId,
          expiresAt,
        },
        select: { id: true, membershipId: true, role: true, scope: true, projectId: true,
          siteId: true, grantedAt: true, expiresAt: true },
      });

      await tx.auditEvent.create({ data: {
        organizationId: actor.organizationId,
        actorMembershipId: owner.id,
        action: "rbac.role.granted",
        resourceType: "OperationalRoleAssignment",
        resourceId: grant.id,
        requestId,
        after: { membershipId: subject.id, role: input.role, scope: input.scope,
          projectId, siteId, expiresAt: expiresAt?.toISOString() ?? null },
      } });
      return grant;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "CONFLICT", "An active grant of this role and scope already exists.");
    }
    throw error;
  }
}

export async function revokeOperationalRole(
  actor: AuthorizationContext,
  assignmentId: string,
  requestId: string,
) {
  assertOwnerRoleManager(actor);
  return prisma.$transaction(async (tx) => {
    const owner = await tx.member.findFirst({
      where: { id: actor.membershipId, organizationId: actor.organizationId,
        role: "owner", disabledAt: null },
      select: { id: true },
    });
    if (!owner) throw new ApiError(403, "FORBIDDEN", "Owner permission has been revoked.");

    const grant = await tx.operationalRoleAssignment.findFirst({
      where: { id: assignmentId, organizationId: actor.organizationId },
      select: { id: true, membershipId: true, role: true, scope: true,
        projectId: true, siteId: true, revokedAt: true },
    });
    if (!grant) throw new ApiError(404, "NOT_FOUND", "Role assignment not found.");
    if (grant.revokedAt) throw new ApiError(409, "CONFLICT", "Role assignment was already revoked.");

    const changed = await tx.operationalRoleAssignment.updateMany({
      where: { id: assignmentId, organizationId: actor.organizationId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByMembershipId: owner.id },
    });
    if (changed.count !== 1) throw new ApiError(409, "CONFLICT", "Role assignment changed concurrently.");

    await tx.auditEvent.create({ data: {
      organizationId: actor.organizationId,
      actorMembershipId: owner.id,
      action: "rbac.role.revoked",
      resourceType: "OperationalRoleAssignment",
      resourceId: grant.id,
      requestId,
      before: { membershipId: grant.membershipId, role: grant.role, scope: grant.scope,
        projectId: grant.projectId, siteId: grant.siteId },
      after: { revoked: true },
    } });
    return { assignmentId, status: "revoked" as const };
  });
}
