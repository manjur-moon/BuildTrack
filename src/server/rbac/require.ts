import { ApiError } from "@/server/api/errors";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import { resolveAuthorizationContext } from "./context";
import { hasPermission, type AuthorizationContext, type Permission } from "./policy";

/**
 * Reads session, organization, grants and live assignments from trusted server storage.
 * Never accept authorization context or membership IDs from HTTP request bodies.
 */
export async function requireAuthorizationContext(headers: Headers): Promise<AuthorizationContext> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user.emailVerified) {
    throw new ApiError(401, "UNAUTHENTICATED", "A verified session is required.");
  }
  const context = await resolveAuthorizationContext(headers);
  if (!context) {
    throw new ApiError(403, "FORBIDDEN", "Select an active organization with an enabled membership.");
  }
  return context;
}

/** Only the exact Better Auth organization owner may issue/revoke business role grants in v1. */
export function assertOwnerRoleManager(ctx: AuthorizationContext): void {
  if (ctx.betterAuthRole !== "owner" || !hasPermission(ctx, "role:assign", {
    organizationId: ctx.organizationId,
  })) {
    throw new ApiError(403, "FORBIDDEN", "Only the organization owner can manage operational roles.");
  }
}

/** A project ID is not an authorization scope: load the actual project from DB. */
export async function requireProjectPermission(
  context: AuthorizationContext,
  projectId: string,
  permission: Permission,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: context.organizationId, archivedAt: null },
    select: { id: true, organizationId: true, name: true },
  });
  if (!project || !hasPermission(context, permission, {
    organizationId: project.organizationId, projectId: project.id,
  })) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }
  return project;
}

export async function requireSitePermission(
  context: AuthorizationContext,
  projectId: string,
  siteId: string,
  permission: Permission,
) {
  const site = await prisma.constructionSite.findFirst({
    where: { id: siteId, projectId, organizationId: context.organizationId, archivedAt: null,
      project: { is: { archivedAt: null } } },
    select: { id: true, projectId: true, organizationId: true, name: true },
  });
  if (!site || !hasPermission(context, permission, {
    organizationId: site.organizationId, projectId: site.projectId, siteId: site.id,
  })) {
    throw new ApiError(404, "NOT_FOUND", "Site not found.");
  }
  return site;
}

/** Checks a task's real project, site and LIVE assignees, never claims from the client. */
export async function requireTaskPermission(
  context: AuthorizationContext,
  taskId: string,
  permission: Permission,
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: context.organizationId, archivedAt: null,
      project: { is: { archivedAt: null } } },
    select: {
      id: true, projectId: true, siteId: true, organizationId: true, status: true,
      assignees: { where: { unassignedAt: null, projectMember: { is: { leftAt: null } } },
        select: { membershipId: true } },
    },
  });
  if (!task || !hasPermission(context, permission, {
    organizationId: task.organizationId,
    projectId: task.projectId,
    ...(task.siteId ? { siteId: task.siteId } : {}),
    assignedMembershipIds: task.assignees.map((assignment) => assignment.membershipId),
  })) {
    throw new ApiError(404, "NOT_FOUND", "Task not found.");
  }
  return task;
}
