import { z } from "zod";
const page = z.string().regex(/^[1-9]\d{0,3}$/).default("1").transform(Number);
export const inboxQuery = z.strictObject({ page, filter: z.enum(["all", "unread", "read"]).default("all") });
export const inboxMutation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("refresh") }),
  z.strictObject({ action: z.literal("read-all") }),
  z.strictObject({ action: z.literal("set-read"), id: z.string().min(1).max(128), read: z.boolean() }),
]);
export const activityQuery = z.strictObject({ page, q: z.string().trim().max(100).default("") });
export type InboxQuery = z.output<typeof inboxQuery>;
export type InboxMutation = z.output<typeof inboxMutation>;
export type ActivityQuery = z.output<typeof activityQuery>;
