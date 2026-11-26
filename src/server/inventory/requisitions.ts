import { prisma } from "@/server/db/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { ApiError } from "@/server/api/errors";
import { inventoryWrite, audit, type Tx } from "./transaction";
import { visibleSite, lockedSite, missing, conflict } from "./access";
import { ensureInventory } from "./stock";
import { toMilli, fromMilli, requireWithin,
  type RequestInput, type DecisionInput, type IssueInput } from "./input";

const details = { items: { include: { material: { select: { id: true, name: true, sku: true, unit: true } } } },
  issues: { include: { items: { include: { requestItem: { select: { materialId: true } } } } } },
} as const;
async function loadRequest(tx: Tx, org: string, id: string) {
  const request = await tx.materialRequest.findFirst({ where: { id, organizationId: org }, include: details });
  if (!request) missing();
  return request;
}
function dto(request: Awaited<ReturnType<typeof loadRequest>>) {
  return { id: request.id, projectId: request.projectId, siteId: request.siteId,
    reason: request.reason, status: request.status,
    requestedByMembershipId: request.requestedByMembershipId,
    approvedByMembershipId: request.approvedByMembershipId,
    requestedAt: request.requestedAt.toISOString(),
    items: request.items.map((line) => ({ id: line.id, materialId: line.materialId,
      materialName: line.material.name, sku: line.material.sku, unit: line.material.unit,
      quantityRequested: line.quantityRequested.toString(), quantityApproved: line.quantityApproved?.toString() ?? null,
      quantityIssued: fromMilli(request.issues.reduce((sum, issue) => sum + issue.items
        .filter((item) => item.requestItemId === line.id).reduce((v, item) => v + toMilli(item.quantity.toString()), 0n), 0n)),
    })),
  };
}
export async function listRequests(actor: AuthorizationContext, siteId: string, page: number, limit: number, status?: string) {
  await visibleSite(actor, siteId);
  const where = { organizationId: actor.organizationId, siteId,
    ...(status ? { status: status as "PENDING" | "APPROVED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "REJECTED" | "CANCELLED" } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.materialRequest.findMany({ where, include: details,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.materialRequest.count({ where }),
  ]);
  return { items: rows.map(dto), total, page, limit };
}
export async function createRequest(actor: AuthorizationContext, input: RequestInput, key: string, requestId: string) {
  return inventoryWrite(actor, "material.request.create", key, input, async (tx) => {
    const site = await lockedSite(tx, actor, input.siteId, "material-request:create");
    if (site.projectId !== input.projectId) missing();
    // Lock material catalogue rows after the site lock, always in sorted ID order.
    // This serializes against owner archiving while the requisition is being created.
    const sortedIds = [...input.items.map((i) => i.materialId)].sort();
    for (const materialId of sortedIds) {
      const material = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
        SELECT "id", "archivedAt" FROM "Material"
        WHERE "id" = ${materialId} AND "organizationId" = ${actor.organizationId} FOR UPDATE
      `;
      if (!material.length || material[0].archivedAt) missing();
    }
    // Composite tenant foreign keys overlap in the nested create input.
    // Write the header and lines separately inside the same inventory transaction.
    const header = await tx.materialRequest.create({ data: {
      organizationId: actor.organizationId, projectId: site.projectId, siteId: input.siteId,
      requestedByMembershipId: actor.membershipId, reason: input.reason,
    }, select: { id: true } });
    await tx.materialRequestItem.createMany({ data: input.items.map((line) => ({
      organizationId: actor.organizationId, requestId: header.id,
      materialId: line.materialId, quantityRequested: line.quantity,
    })) });
    const request = await loadRequest(tx, actor.organizationId, header.id);
    await audit(tx, actor, requestId, "MATERIAL_REQUEST_CREATED", "MATERIAL_REQUEST", request.id,
      { siteId: request.siteId, lines: input.items });
    return dto(request);
  });
}
export async function decideRequest(actor: AuthorizationContext, id: string, input: DecisionInput,
  key: string, requestId: string) {
  return inventoryWrite(actor, "material.request.decision", key, { id, ...input }, async (tx) => {
    const initial = await tx.materialRequest.findFirst({ where: { id, organizationId: actor.organizationId },
      select: { siteId: true } });
    if (!initial) missing();
    await lockedSite(tx, actor, initial.siteId, "material-request:approve");
    // Site lock serializes decisions against issues and project/site archive.
    const request = await loadRequest(tx, actor.organizationId, id);
    if (request.status !== "PENDING") conflict("Only pending requisitions can be decided.");
    if (request.requestedByMembershipId === actor.membershipId) {
      throw new ApiError(403, "FORBIDDEN", "Requester cannot approve or reject their own requisition.");
    }
    if (input.decision === "APPROVE") {
      const supplied = new Map(input.lines.map((line) => [line.itemId, line.quantityApproved]));
      if (supplied.size !== request.items.length || request.items.some((line) => !supplied.has(line.id))) {
        throw new ApiError(422, "VALIDATION_ERROR", "Provide exactly one approval quantity per requisition line.");
      }
      let approved = 0n;
      for (const line of request.items) {
        const quantity = supplied.get(line.id);
        if (quantity === undefined) missing();
        const value = toMilli(quantity);
        requireWithin(value, toMilli(line.quantityRequested.toString()), "Approval exceeds requested quantity.");
        approved += value;
        await tx.materialRequestItem.update({ where: { id: line.id }, data: { quantityApproved: quantity } });
      }
      if (approved === 0n) throw new ApiError(422, "VALIDATION_ERROR", "Approve at least one unit or reject the request.");
      await tx.materialRequest.update({ where: { id }, data: {
        status: "APPROVED", approvedByMembershipId: actor.membershipId, approvedAt: new Date(),
      } });
    } else {
      await tx.materialRequest.update({ where: { id }, data: {
        status: "REJECTED", approvedByMembershipId: actor.membershipId, approvedAt: new Date(), closedAt: new Date(),
      } });
    }
    await audit(tx, actor, requestId, input.decision === "APPROVE" ? "MATERIAL_REQUEST_APPROVED" : "MATERIAL_REQUEST_REJECTED",
      "MATERIAL_REQUEST", id, { decision: input.decision, ...(input.decision === "APPROVE" ? { lines: input.lines } : { reason: input.reason }) });
    return dto(await loadRequest(tx, actor.organizationId, id));
  });
}
export async function issueRequest(actor: AuthorizationContext, id: string, input: IssueInput,
  key: string, requestId: string) {
  return inventoryWrite(actor, "material.request.issue", key, { id, ...input }, async (tx) => {
    const initial = await tx.materialRequest.findFirst({ where: { id, organizationId: actor.organizationId },
      select: { siteId: true } });
    if (!initial) missing();
    const site = await lockedSite(tx, actor, initial.siteId, "stock:record");
    const request = await loadRequest(tx, actor.organizationId, id);
    if (request.projectId !== site.projectId || !["APPROVED", "PARTIALLY_FULFILLED"].includes(request.status)) {
      conflict("Requisition is not approved for issuance.");
    }
    const lines = new Map(request.items.map((x) => [x.id, x]));
    const totals = new Map<string, bigint>();
    for (const line of request.items) totals.set(line.id,
      request.issues.reduce((sum, issue) => sum + issue.items.filter((x) => x.requestItemId === line.id)
        .reduce((v, x) => v + toMilli(x.quantity.toString()), 0n), 0n));
    for (const line of input.lines) {
      const requestLine = lines.get(line.requestItemId);
      if (!requestLine || !requestLine.quantityApproved || toMilli(requestLine.quantityApproved.toString()) === 0n) missing();
      const issued = totals.get(line.requestItemId) ?? 0n;
      requireWithin(issued + toMilli(line.quantity), toMilli(requestLine.quantityApproved.toString()),
        "Issue exceeds remaining approved quantity.");
    }
    // Lock catalogue rows in sorted order across different sites to avoid deadlocks.
    const materialIds = [...new Set(input.lines.map((line) => lines.get(line.requestItemId)!.materialId))].sort();
    for (const materialId of materialIds) {
      const material = await tx.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>`
        SELECT "id", "archivedAt" FROM "Material" WHERE "id" = ${materialId}
          AND "organizationId" = ${actor.organizationId} FOR UPDATE
      `;
      if (!material.length || material[0].archivedAt) missing();
    }
    // Create issue header; move stock and audit all lines inside the same transaction.
    const issue = await tx.materialIssue.create({ data: {
      organizationId: actor.organizationId, projectId: request.projectId, siteId: request.siteId,
      requestId: id, issuedByMembershipId: actor.membershipId, idempotencyKey: key,
    }, select: { id: true, issuedAt: true } });
    for (const [i, line] of input.lines.entries()) {
      const reqItem = lines.get(line.requestItemId)!;
      const inventory = await ensureInventory(tx, actor.organizationId, request.siteId, reqItem.materialId);
      const newBalance = toMilli(inventory.onHand.toString()) - toMilli(line.quantity);
      if (newBalance < 0n) conflict(`Insufficient stock for material ${reqItem.material.sku}.`);
      const issued = await tx.materialIssueItem.create({ data: {
        organizationId: actor.organizationId, requestId: id, issueId: issue.id,
        requestItemId: line.requestItemId, quantity: line.quantity,
      }, select: { id: true } });
      await tx.siteInventory.update({ where: { id: inventory.id }, data: { onHand: fromMilli(newBalance) } });
      await tx.stockMovement.create({ data: {
        organizationId: actor.organizationId, inventoryId: inventory.id, type: "ISSUE",
        quantityDelta: fromMilli(-toMilli(line.quantity)), issueItemId: issued.id,
        idempotencyKey: `${key}-${i}`, performedByMembershipId: actor.membershipId,
        reason: `Approved requisition ${id}`,
      } });
      totals.set(line.requestItemId, (totals.get(line.requestItemId) ?? 0n) + toMilli(line.quantity));
    }
    const finished = request.items.every((line) =>
      (totals.get(line.id) ?? 0n) >= toMilli(line.quantityApproved?.toString() ?? "0"));
    await tx.materialRequest.update({ where: { id }, data: {
      status: finished ? "FULFILLED" : "PARTIALLY_FULFILLED", ...(finished ? { closedAt: new Date() } : {}),
    } });
    await audit(tx, actor, requestId, "MATERIAL_ISSUED", "MATERIAL_ISSUE", issue.id,
      { requestId: id, siteId: request.siteId, lines: input.lines });
    return { id: issue.id, requestId: id, status: finished ? "FULFILLED" : "PARTIALLY_FULFILLED",
      issuedAt: issue.issuedAt.toISOString() };
  });
}
