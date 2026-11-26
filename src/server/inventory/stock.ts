import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { inventoryWrite, audit, type Tx } from "./transaction";
import { visibleSite, lockedSite, requireCatalogAdmin, missing } from "./access";
import { toMilli, fromMilli, requireWithin, type MovementInput } from "./input";
import type { z } from "zod";
import type { thresholdInput } from "./input";

export async function ensureInventory(tx: Tx, org: string, siteId: string, materialId: string) {
  // Serialize against catalog archiving. Acquire AFTER site lock in every stock writer.
  const material = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
    SELECT "id", "archivedAt" FROM "Material"
    WHERE "id" = ${materialId} AND "organizationId" = ${org} FOR UPDATE
  `;
  if (!material.length || material[0].archivedAt) missing();
  return tx.siteInventory.upsert({ where: { organizationId_siteId_materialId: { organizationId: org, siteId, materialId } },
    create: { organizationId: org, siteId, materialId, onHand: "0", reorderLevel: "0" }, update: {},
  });
}
export async function listStock(actor: AuthorizationContext, siteId: string, page: number, limit: number, q = "") {
  const site = await visibleSite(actor, siteId);
  const where = { organizationId: actor.organizationId, siteId,
    ...(q ? { material: { is: { OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { sku: { contains: q, mode: "insensitive" as const } },
    ] } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.siteInventory.findMany({ where, include: { material: { select: { name: true, sku: true, unit: true } } },
      orderBy: [{ material: { name: "asc" } }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.siteInventory.count({ where }),
  ]);
  return { site, items: rows.map((r) => ({ id: r.id, siteId: r.siteId, materialId: r.materialId,
    materialName: r.material.name, sku: r.material.sku, unit: r.material.unit,
    onHand: r.onHand.toString(), reorderLevel: r.reorderLevel.toString(),
    lowStock: toMilli(r.reorderLevel.toString()) > 0n && toMilli(r.onHand.toString()) <= toMilli(r.reorderLevel.toString()),
  })), total, page, limit };
}
export async function listMovements(actor: AuthorizationContext, siteId: string, page: number, limit: number) {
  await visibleSite(actor, siteId);
  const where = { organizationId: actor.organizationId, inventory: { is: { organizationId: actor.organizationId, siteId } } };
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({ where, include: { inventory: { include: { material: { select: { name: true, sku: true, unit: true } } } } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.stockMovement.count({ where }),
  ]);
  return { items: rows.map((r) => ({ id: r.id, type: r.type, quantityDelta: r.quantityDelta.toString(),
    materialName: r.inventory.material.name, materialSku: r.inventory.material.sku,
    reason: r.reason, recordedAt: r.recordedAt.toISOString(),
  })), total, page, limit };
}
export async function recordMovement(actor: AuthorizationContext, input: MovementInput, key: string, requestId: string) {
  return inventoryWrite(actor, "inventory.movement", key, input, async (tx) => {
    await lockedSite(tx, actor, input.siteId, "stock:record");
    if (input.type !== "RECEIPT") await requireCatalogAdmin(tx, actor);
    const inventory = await ensureInventory(tx, actor.organizationId, input.siteId, input.materialId);
    const delta = toMilli(input.quantity) * (input.type === "ADJUSTMENT_OUT" ? -1n : 1n);
    const balance = toMilli(inventory.onHand.toString()) + delta;
    requireWithin(balance, 999999999999999n, "Insufficient site stock or balance exceeds maximum.");
    await tx.siteInventory.update({ where: { id: inventory.id }, data: { onHand: fromMilli(balance) } });
    const movement = await tx.stockMovement.create({ data: {
      organizationId: actor.organizationId, inventoryId: inventory.id, type: input.type,
      quantityDelta: fromMilli(delta), idempotencyKey: key, reason: input.reason,
      performedByMembershipId: actor.membershipId,
    }, select: { id: true, type: true, recordedAt: true } });
    await audit(tx, actor, requestId, `STOCK_${input.type}`, "STOCK_MOVEMENT", movement.id,
      { siteId: input.siteId, materialId: input.materialId, delta: fromMilli(delta), balance: fromMilli(balance) });
    return { id: movement.id, type: movement.type, balance: fromMilli(balance), recordedAt: movement.recordedAt.toISOString() };
  });
}
export async function setThreshold(actor: AuthorizationContext, input: z.output<typeof thresholdInput>, key: string, requestId: string) {
  return inventoryWrite(actor, "inventory.reorder", key, input, async (tx) => {
    await lockedSite(tx, actor, input.siteId, "stock:record");
    const inventory = await ensureInventory(tx, actor.organizationId, input.siteId, input.materialId);
    const updated = await tx.siteInventory.update({ where: { id: inventory.id }, data: { reorderLevel: input.reorderLevel } });
    await audit(tx, actor, requestId, "STOCK_REORDER_LEVEL_SET", "SITE_INVENTORY", inventory.id,
      { siteId: input.siteId, materialId: input.materialId, reorderLevel: updated.reorderLevel.toString() },
      { reorderLevel: inventory.reorderLevel.toString() });
    return { inventoryId: inventory.id, reorderLevel: updated.reorderLevel.toString() };
  });
}
