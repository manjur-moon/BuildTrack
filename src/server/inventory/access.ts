import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/client";
import { hasPermission, type AuthorizationContext, type Permission } from "@/server/rbac/policy";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { requireLiveProjectLock, lockSiteRow } from "@/server/construction/locking";
import type { Prisma } from "@/generated/prisma/client";
import { canManageCatalog } from "./permissions";
export { canManageCatalog, canViewInventory, scopedInventoryWhere } from "./permissions";

export type InventoryTx = Prisma.TransactionClient;
export function missing(): never { throw new ApiError(404, "NOT_FOUND", "Inventory resource not found."); }
export function conflict(detail: string): never { throw new ApiError(409, "CONFLICT", detail); }
export async function requireCatalogAdmin(tx: InventoryTx, actor: AuthorizationContext) {
  if (!canManageCatalog(actor)) missing();
  await assertCurrentWriteAccess(tx, actor, "material:manage", { organizationId: actor.organizationId });
}
export async function visibleSite(actor: AuthorizationContext, siteId: string) {
  const site = await prisma.constructionSite.findFirst({ where: {
    id: siteId, organizationId: actor.organizationId, archivedAt: null,
    project: { is: { archivedAt: null } },
  }, select: { id: true, projectId: true, name: true, status: true } });
  if (!site || !hasPermission(actor, "inventory:view", { organizationId: actor.organizationId, projectId: site.projectId, siteId: site.id })) missing();
  return site;
}
export async function lockedSite(
  tx: InventoryTx, actor: AuthorizationContext, siteId: string, permission: Permission,
) {
  const initial = await tx.constructionSite.findFirst({ where: {
    id: siteId, organizationId: actor.organizationId, archivedAt: null,
  }, select: { id: true, projectId: true } });
  if (!initial) missing();
  await requireLiveProjectLock(tx, actor.organizationId, initial.projectId);
  const locked = await lockSiteRow(tx, actor.organizationId, initial.projectId, siteId);
  if (!locked || locked.archivedAt || locked.status === "CLOSED") conflict("Site is closed or archived.");
  const resource = { organizationId: actor.organizationId, projectId: initial.projectId, siteId };
  if (!hasPermission(actor, permission, resource)) missing();
  await assertCurrentWriteAccess(tx, actor, permission, resource);
  return { ...initial, status: locked.status };
}
