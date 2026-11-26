import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { ApiError } from "@/server/api/errors";
import { inventoryWrite, audit } from "./transaction";
import { canViewInventory, canManageCatalog, requireCatalogAdmin, missing } from "./access";
import type { MaterialInput } from "./input";
import type { z } from "zod";
import type { categoryInput, editMaterialInput } from "./input";

export async function listCatalog(actor: AuthorizationContext, q: string, page: number, limit: number) {
  if (!canViewInventory(actor) && !canManageCatalog(actor)) missing();
  const where = { organizationId: actor.organizationId, archivedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } },
      { sku: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, categories] = await Promise.all([
    prisma.material.findMany({ where, select: {
      id: true, name: true, sku: true, unit: true, categoryId: true,
      category: { select: { name: true } },
    }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.material.count({ where }),
    prisma.materialCategory.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { items: rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, unit: r.unit,
    categoryId: r.categoryId, categoryName: r.category.name })), categories, total, page, limit,
    canManage: canManageCatalog(actor) };
}
export async function createCategory(actor: AuthorizationContext, input: z.output<typeof categoryInput>, key: string, requestId: string) {
  if (!canManageCatalog(actor)) missing();
  return inventoryWrite(actor, "material.category.create", key, input, async (tx) => {
    await requireCatalogAdmin(tx, actor);
    const category = await tx.materialCategory.create({ data: { organizationId: actor.organizationId, name: input.name }, select: { id: true, name: true } });
    await audit(tx, actor, requestId, "MATERIAL_CATEGORY_CREATED", "MATERIAL_CATEGORY", category.id, { name: category.name });
    return category;
  });
}
export async function createMaterial(actor: AuthorizationContext, input: MaterialInput, key: string, requestId: string) {
  if (!canManageCatalog(actor)) missing();
  return inventoryWrite(actor, "material.create", key, input, async (tx) => {
    await requireCatalogAdmin(tx, actor);
    const cat = await tx.materialCategory.findFirst({ where: { organizationId: actor.organizationId, id: input.categoryId }, select: { id: true } });
    if (!cat) missing();
    const material = await tx.material.create({ data: {
      organizationId: actor.organizationId, categoryId: input.categoryId,
      name: input.name, sku: input.sku, unit: input.unit,
    }, select: { id: true, name: true, sku: true, unit: true, categoryId: true } });
    await audit(tx, actor, requestId, "MATERIAL_CREATED", "MATERIAL", material.id, { sku: material.sku, name: material.name, unit: material.unit });
    return material;
  });
}
export async function editMaterial(actor: AuthorizationContext, id: string,
  input: z.output<typeof editMaterialInput>, key: string, requestId: string) {
  if (!canManageCatalog(actor)) missing();
  return inventoryWrite(actor, "material.edit", key, { id, ...input }, async (tx) => {
    await requireCatalogAdmin(tx, actor);
    const lock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Material" WHERE "id" = ${id}
        AND "organizationId" = ${actor.organizationId} FOR UPDATE
    `;
    if (!lock.length) missing();
    const old = await tx.material.findFirst({ where: { id, organizationId: actor.organizationId }, select: { name: true, archivedAt: true } });
    if (!old) missing();
    if (old.archivedAt && input.archived !== false) throw new ApiError(409, "CONFLICT", "Material is archived.");
    if (input.archived === true) {
      const active = await tx.siteInventory.count({ where: { organizationId: actor.organizationId, materialId: id, onHand: { gt: 0 } } });
      if (active) throw new ApiError(409, "CONFLICT", "Cannot archive material with remaining site stock.");
      const pending = await tx.materialRequestItem.count({ where: { organizationId: actor.organizationId, materialId: id,
        request: { is: { status: { in: ["PENDING", "APPROVED", "PARTIALLY_FULFILLED"] } } } } });
      if (pending) throw new ApiError(409, "CONFLICT", "Cannot archive material referenced by an open requisition.");
      const outstanding = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT mii."id" FROM "MaterialIssueItem" mii
        JOIN "MaterialRequestItem" mri ON mri."id" = mii."requestItemId"
          AND mri."organizationId" = mii."organizationId"
        LEFT JOIN (
          SELECT "returnOfIssueItemId", SUM("quantityDelta") AS returned
          FROM "StockMovement" WHERE "organizationId" = ${actor.organizationId}
            AND "type" = 'RETURN' GROUP BY "returnOfIssueItemId"
        ) ret ON ret."returnOfIssueItemId" = mii."id"
        WHERE mii."organizationId" = ${actor.organizationId}
          AND mri."materialId" = ${id}
          AND mii."quantity" - mii."consumedQuantity" - COALESCE(ret.returned, 0) > 0
        LIMIT 1
      `;
      if (outstanding.length) throw new ApiError(409, "CONFLICT", "Cannot archive material with unconsumed issued stock.");
    }
    const updated = await tx.material.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    }, select: { id: true, name: true, sku: true, archivedAt: true } });
    await audit(tx, actor, requestId, "MATERIAL_UPDATED", "MATERIAL", id,
      { name: updated.name, archived: Boolean(updated.archivedAt) }, { name: old.name, archived: Boolean(old.archivedAt) });
    return { id: updated.id, name: updated.name, sku: updated.sku, archived: Boolean(updated.archivedAt) };
  });
}
