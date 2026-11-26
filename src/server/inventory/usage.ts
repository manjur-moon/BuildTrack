import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { inventoryWrite, audit, type Tx } from "./transaction";
import { visibleSite, lockedSite, missing } from "./access";
import { ensureInventory } from "./stock";
import { toMilli, fromMilli, requireWithin } from "./input";
import type { z } from "zod";
import type { usageInput, returnInput } from "./input";

async function getIssueItem(tx: Tx, org: string, id: string) {
  const item = await tx.materialIssueItem.findFirst({ where: { id, organizationId: org },
    include: { issue: { select: { siteId: true, projectId: true, requestId: true } },
      requestItem: { include: { material: { select: { id: true, name: true, sku: true } } } },
    } });
  if (!item) missing();
  return item;
}
async function issuedBalance(tx: Tx, org: string, id: string) {
  const total = await tx.stockMovement.aggregate({ where: { organizationId: org,
    type: "RETURN", returnOfIssueItemId: id }, _sum: { quantityDelta: true } });
  return toMilli(total._sum.quantityDelta?.toString() ?? "0");
}
export async function listIssuedItems(actor: AuthorizationContext, siteId: string, page: number, limit: number) {
  await visibleSite(actor, siteId);
  const where = { organizationId: actor.organizationId, issue: { is: { organizationId: actor.organizationId, siteId } } };
  const [rows, count] = await Promise.all([
    prisma.materialIssueItem.findMany({ where, include: {
      issue: { select: { requestId: true, issuedAt: true } },
      requestItem: { include: { material: { select: { name: true, sku: true, unit: true } } } },
      returnMovements: { select: { quantityDelta: true } },
    }, orderBy: [{ issue: { issuedAt: "desc" } }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.materialIssueItem.count({ where }),
  ]);
  return { page, limit, total: count, items: rows.map((r) => {
    const issued = toMilli(r.quantity.toString());
    const used = toMilli(r.consumedQuantity.toString());
    const returned = r.returnMovements.reduce((sum, v) => sum + toMilli(v.quantityDelta.toString()), 0n);
    return { id: r.id, requestId: r.issue.requestId,
      materialName: r.requestItem.material.name, sku: r.requestItem.material.sku,
      unit: r.requestItem.material.unit, issued: fromMilli(issued), consumed: fromMilli(used),
      returned: fromMilli(returned), remaining: fromMilli(issued - used - returned),
      issuedAt: r.issue.issuedAt.toISOString(),
    };
  }) };
}
export async function consumeIssued(actor: AuthorizationContext, id: string,
  input: z.output<typeof usageInput>, key: string, requestId: string) {
  return inventoryWrite(actor, "material.issue.consume", key, { id, ...input }, async (tx) => {
    const initial = await getIssueItem(tx, actor.organizationId, id);
    await lockedSite(tx, actor, initial.issue.siteId, "stock:record");
  }, async (tx) => {
    const initial = await getIssueItem(tx, actor.organizationId, id);
    await lockedSite(tx, actor, initial.issue.siteId, "stock:record");
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MaterialIssueItem" WHERE "id" = ${id}
        AND "organizationId" = ${actor.organizationId} FOR UPDATE
    `;
    if (!rows.length) missing();
    const item = await getIssueItem(tx, actor.organizationId, id);
    const returned = await issuedBalance(tx, actor.organizationId, id);
    const used = toMilli(item.consumedQuantity.toString());
    const qty = toMilli(input.quantity);
    requireWithin(used + returned + qty, toMilli(item.quantity.toString()),
      "Consumption exceeds unconsumed, unreturned issued material.");
    const usage = await tx.materialUsageRecord.create({ data: {
      organizationId: actor.organizationId, issueItemId: id, quantity: input.quantity,
      recordedByMembershipId: actor.membershipId, note: input.note ?? null,
    }, select: { id: true, usedAt: true } });
    await tx.materialIssueItem.update({ where: { id }, data: { consumedQuantity: fromMilli(used + qty) } });
    await audit(tx, actor, requestId, "MATERIAL_CONSUMED", "MATERIAL_USAGE", usage.id,
      { issueItemId: id, quantity: input.quantity, totalConsumed: fromMilli(used + qty) });
    return { id: usage.id, issueItemId: id, consumedTotal: fromMilli(used + qty), usedAt: usage.usedAt.toISOString() };
  });
}
export async function returnIssued(actor: AuthorizationContext, id: string,
  input: z.output<typeof returnInput>, key: string, requestId: string) {
  return inventoryWrite(actor, "material.issue.return", key, { id, ...input }, async (tx) => {
    const initial = await getIssueItem(tx, actor.organizationId, id);
    await lockedSite(tx, actor, initial.issue.siteId, "stock:record");
  }, async (tx) => {
    const initial = await getIssueItem(tx, actor.organizationId, id);
    await lockedSite(tx, actor, initial.issue.siteId, "stock:record");
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MaterialIssueItem" WHERE "id" = ${id}
        AND "organizationId" = ${actor.organizationId} FOR UPDATE
    `;
    if (!rows.length) missing();
    const item = await getIssueItem(tx, actor.organizationId, id);
    const returned = await issuedBalance(tx, actor.organizationId, id);
    const qty = toMilli(input.quantity);
    requireWithin(returned + qty + toMilli(item.consumedQuantity.toString()), toMilli(item.quantity.toString()),
      "Return exceeds unconsumed issued material.");
    const inv = await ensureInventory(tx, actor.organizationId, item.issue.siteId, item.requestItem.materialId);
    const balance = toMilli(inv.onHand.toString()) + qty;
    await tx.siteInventory.update({ where: { id: inv.id }, data: { onHand: fromMilli(balance) } });
    const movement = await tx.stockMovement.create({ data: {
      organizationId: actor.organizationId, inventoryId: inv.id, type: "RETURN",
      quantityDelta: input.quantity, returnOfIssueItemId: id, reason: input.reason,
      idempotencyKey: key, performedByMembershipId: actor.membershipId,
    }, select: { id: true, recordedAt: true } });
    await audit(tx, actor, requestId, "MATERIAL_RETURNED", "STOCK_MOVEMENT", movement.id,
      { issueItemId: id, quantity: input.quantity, newSiteBalance: fromMilli(balance) });
    return { id: movement.id, issueItemId: id, siteBalance: fromMilli(balance), returnedAt: movement.recordedAt.toISOString() };
  });
}
