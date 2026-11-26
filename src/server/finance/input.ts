import { z } from "zod";
import { cents } from "./money";
const id = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(8).max(500);
export const amount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
const positive = amount.pipe(z.string().refine((v) => cents(v) > 0n));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v;
});
export const financeInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("category"), name: z.string().trim().min(2).max(120) }),
  z.strictObject({ action: z.literal("budget"), projectId: id, amount, reason, expected: amount.nullable() }),
  z.strictObject({ action: z.literal("draft"), projectId: id, categoryId: id, title: z.string().trim().min(2).max(140), description: z.string().trim().max(2000).optional(), amount: positive, date }),
  z.strictObject({ action: z.literal("post"), projectId: id, expenseId: id }),
  z.strictObject({ action: z.literal("void"), projectId: id, expenseId: id, reason }),
]);
export const financeQuery = z.strictObject({ projectId: id, page: z.string().regex(/^[1-9]\d{0,3}$/).default("1") });
export type FinanceInput = z.output<typeof financeInput>;
