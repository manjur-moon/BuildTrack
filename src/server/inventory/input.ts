import { z } from "zod";
import { ApiError } from "@/server/api/errors";

const id = z.string().trim().min(1).max(128);
const label = z.string().trim().min(2).max(120);
const qty = z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/, "Use a positive decimal with up to 3 places")
  .refine((s) => toMilli(s) > 0n, "Quantity must be greater than zero");
const nonnegative = z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/, "Use a nonnegative decimal with up to 3 places");
const text = z.string().trim().min(8).max(500);
export const categoryInput = z.strictObject({ name: label });
export const materialInput = z.strictObject({
  name: label, sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/),
  categoryId: id,
  unit: z.enum(["PIECE","BAG","KILOGRAM","TONNE","LITRE","METRE","SQUARE_METRE","CUBIC_METRE","BOX"]),
});
export const editMaterialInput = z.strictObject({ name: label.optional(), archived: z.boolean().optional() })
  .refine((x) => x.name !== undefined || x.archived !== undefined, "At least one change required");
export const movementInput = z.strictObject({
  siteId: id, materialId: id, type: z.enum(["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  quantity: qty, reason: text,
});
export const thresholdInput = z.strictObject({ siteId: id, materialId: id, reorderLevel: nonnegative });
export const requestInput = z.strictObject({ projectId: id, siteId: id, reason: text,
  items: z.array(z.strictObject({ materialId: id, quantity: qty })).min(1).max(25),
}).superRefine((v, ctx) => {
  if (new Set(v.items.map((x) => x.materialId)).size !== v.items.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate material in requisition", path: ["items"] });
  }
});
export const decisionInput = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("APPROVE"), lines: z.array(z.strictObject({ itemId: id, quantityApproved: nonnegative })).min(1).max(25) }),
  z.strictObject({ decision: z.literal("REJECT"), reason: text }),
]);
export const issueInput = z.strictObject({ lines: z.array(z.strictObject({ requestItemId: id, quantity: qty })).min(1).max(25) })
  .superRefine((v, ctx) => { if (new Set(v.lines.map((x) => x.requestItemId)).size !== v.lines.length) ctx.addIssue({ code: "custom", message: "Duplicate issue line" }); });
export const usageInput = z.strictObject({ quantity: qty, note: text.optional() });
export const returnInput = z.strictObject({ quantity: qty, reason: text });

export function toMilli(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}
export function fromMilli(value: bigint): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  return `${neg ? "-" : ""}${abs / 1000n}.${(abs % 1000n).toString().padStart(3,"0")}`;
}
export function requireWithin(value: bigint, max: bigint, message: string) {
  if (value < 0n || value > max) throw new ApiError(409, "CONFLICT", message);
}
function invalid(message: string): never { throw new ApiError(422, "VALIDATION_ERROR", message); }
export function parseList(params: URLSearchParams, extra: readonly string[] = []) {
  const allowed = ["q", "page", "limit", "siteId", "status", ...extra];
  for (const [key] of params) if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("Unknown or repeated query filter");
  const q = params.get("q")?.trim() ?? "";
  if (q.length > 100) invalid("Search too long");
  const rawPage = params.get("page") ?? "1";
  const rawLimit = params.get("limit") ?? "20";
  if (!/^[1-9]\d*$/.test(rawPage) || !/^[1-9]\d*$/.test(rawLimit)) invalid("Invalid pagination");
  const page = Number(rawPage), limit = Number(rawLimit);
  if (!Number.isSafeInteger(page) || page > 10000 || !Number.isSafeInteger(limit) || limit > 100) invalid("Pagination out of range");
  const siteId = params.get("siteId") ?? undefined;
  if (siteId && !id.safeParse(siteId).success) invalid("Invalid site ID");
  const status = params.get("status") ?? undefined;
  if (status && !["PENDING", "APPROVED", "PARTIALLY_FULFILLED", "FULFILLED", "REJECTED", "CANCELLED"].includes(status)) invalid("Invalid request status");
  return { q, page, limit, siteId, status };
}
export type MaterialInput = z.output<typeof materialInput>;
export type RequestInput = z.output<typeof requestInput>;
export type DecisionInput = z.output<typeof decisionInput>;
export type IssueInput = z.output<typeof issueInput>;
export type MovementInput = z.output<typeof movementInput>;
