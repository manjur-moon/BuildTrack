import type { Prisma } from "@/generated/prisma/client";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";
import type { TaskListQuery } from "./task-input";

/** SQL scope is always combined with the authenticated organization constraint. */
export function taskReadScope(actor: AuthorizationContext): Prisma.TaskWhereInput {
  const base = { organizationId: actor.organizationId, archivedAt: null,
    project: { is: { archivedAt: null } },
  } satisfies Prisma.TaskWhereInput;
  if (!actor.membershipActive || !actor.emailVerified || !actor.membershipId || !actor.organizationId) {
    return { ...base, id: "__no_authorized_tasks__" };
  }
  const probe = { organizationId: actor.organizationId, projectId: "__scope_probe__", siteId: "__scope_probe__" };
  if (hasPermission(actor, "task:view", probe)) return base;

  const projects = new Set<string>();
  const sites = new Set<string>();
  const contractorProjects = new Set<string>();
  for (const grant of actor.grants) {
    if (grant.organizationId !== actor.organizationId) continue;
    if (grant.scope === "project") {
      if (grant.role === "CONTRACTOR") contractorProjects.add(grant.projectId);
      else if (hasPermission(actor, "task:view", {
        organizationId: actor.organizationId, projectId: grant.projectId,
      })) projects.add(grant.projectId);
    }
    if (grant.scope === "site" && hasPermission(actor, "task:view", {
      organizationId: actor.organizationId, projectId: grant.projectId, siteId: grant.siteId,
    })) sites.add(grant.siteId);
  }
  const scopes: Prisma.TaskWhereInput[] = [];
  if (projects.size) scopes.push({ projectId: { in: [...projects] } });
  if (sites.size) scopes.push({ siteId: { in: [...sites] } });
  if (contractorProjects.size) scopes.push({
    projectId: { in: [...contractorProjects] },
    assignees: { some: { organizationId: actor.organizationId, membershipId: actor.membershipId,
      unassignedAt: null, projectMember: { is: { leftAt: null } },
    } },
  });
  return scopes.length ? { ...base, OR: scopes } : { ...base, id: "__no_authorized_tasks__" };
}

export function taskListFilter(actor: AuthorizationContext, query: TaskListQuery): Prisma.TaskWhereInput {
  return {
    ...(query.q ? { OR: [
      { title: { contains: query.q, mode: "insensitive" as const } },
      { description: { contains: query.q, mode: "insensitive" as const } },
    ] } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.from || query.to ? { dueOn: {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
    } } : {}),
    ...(query.mine ? { assignees: { some: { organizationId: actor.organizationId,
      membershipId: actor.membershipId, unassignedAt: null,
    } } } : {}),
  };
}
