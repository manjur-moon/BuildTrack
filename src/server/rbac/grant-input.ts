import { z } from "zod";

const memberId = z.string().trim().min(1).max(128);
const expiresAt = z.string().datetime({ offset: true }).optional();

/** Client cannot submit an organizationId, grantor ID, or audit metadata. */
export const operationalGrantInputSchema = z.discriminatedUnion("scope", [
  z.strictObject({
    scope: z.literal("ORGANIZATION"),
    role: z.enum(["ADMIN", "FINANCE_MANAGER"]),
    expiresAt,
  }),
  z.strictObject({
    scope: z.literal("PROJECT"),
    role: z.enum(["PROJECT_MANAGER", "FINANCE_MANAGER", "CONTRACTOR"]),
    projectId: memberId,
    expiresAt,
  }),
  z.strictObject({
    scope: z.literal("SITE"),
    role: z.literal("SITE_ENGINEER"),
    projectId: memberId,
    siteId: memberId,
    expiresAt,
  }),
]);

export type OperationalGrantInput = z.infer<typeof operationalGrantInputSchema>;

/** Limit a grant's lifetime for operational hygiene and predictable revocation. */
export function parseExpiry(value: string | undefined, now = new Date()): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) {
    throw new Error("Grant expiry must be in the future.");
  }
  if (date.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
    throw new Error("Grant expiry cannot exceed 366 days.");
  }
  return date;
}

export function scopeFields(input: OperationalGrantInput) {
  return {
    projectId: input.scope === "ORGANIZATION" ? null : input.projectId,
    siteId: input.scope === "SITE" ? input.siteId : null,
  };
}
