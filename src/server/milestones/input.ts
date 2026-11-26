import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const dateOnly = z.iso.date();
const fields = { title: z.string().trim().min(3).max(160), description: z.string().trim().max(3000).nullable().optional(), dueDate: dateOnly };
const existing = { projectId: id, milestoneId: id, expectedUpdatedAt: z.iso.datetime({offset:true}) };
export const milestoneInput = z.discriminatedUnion("action", [
  z.strictObject({action:z.literal("create"),projectId:id,...fields}),
  z.strictObject({action:z.literal("edit"),...existing,...fields}),
  z.strictObject({action:z.literal("transition"),...existing,status:z.enum(["ACHIEVED","MISSED","CANCELLED"]),reason:z.string().trim().min(3).max(500)}),
]);
export const milestoneQuery = z.strictObject({projectId:id,page:z.string().regex(/^[1-9]\d{0,3}$/).default("1"),q:z.string().trim().max(120).default(""),status:z.enum(["PLANNED","ACHIEVED","MISSED","CANCELLED"]).optional()});
export type MilestoneInput = z.output<typeof milestoneInput>;
export type MilestoneQuery = z.output<typeof milestoneQuery>;
