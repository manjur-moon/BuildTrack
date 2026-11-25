import { z } from "zod";
import { hasPermission, type AuthorizationContext } from "@/server/rbac/policy";

const entityId = z.string().trim().min(1).max(128);

export const enrollStaffSchema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("PROJECT_MANAGER"),
    membershipId: entityId,
    projectId: entityId,
  }),
  z.strictObject({
    role: z.literal("SITE_ENGINEER"),
    membershipId: entityId,
    siteId: entityId,
  }),
]);

export type EnrollStaffInput = z.output<typeof enrollStaffSchema>;

/** Pure owner policy (write services also verify owner membership inside the DB transaction). */
export function canManageStaffEnrollment(actor: AuthorizationContext): boolean {
  return actor.betterAuthRole === "owner" && hasPermission(actor, "role:assign", { organizationId: actor.organizationId });
}
