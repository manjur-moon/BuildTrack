import { z } from "zod";
const id = z.string().trim().min(1).max(128);
const optionalText = z.string().trim().max(250).nullable().optional();
const profile = { name: z.string().trim().min(2).max(140), contactName: optionalText, phone: optionalText, email: z.email().max(254).nullable().optional(), address: optionalText, notes: z.string().trim().max(2000).nullable().optional() };
export const contractorInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), ...profile }),
  z.strictObject({ action: z.literal("edit"), contractorId: id, ...profile }),
  z.strictObject({ action: z.literal("status"), contractorId: id, status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) }),
  z.strictObject({ action: z.enum(["link", "unlink"]), contractorId: id, membershipId: id }),
  z.strictObject({ action: z.enum(["assign", "end"]), contractorId: id, projectId: id }),
  z.strictObject({ action: z.literal("grant"), contractorId: id, projectId: id, membershipId: id }),
]);
export type ContractorInput = z.output<typeof contractorInput>;
export const contractorQuery = z.strictObject({ q: z.string().trim().max(120).default(""), status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(), page: z.string().regex(/^[1-9]\d{0,3}$/).default("1"), contractorId: id.optional() });
