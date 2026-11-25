import { z } from "zod";

export const registerWithInvitationSchema = z.strictObject({
  invitationId: z.string().min(8).max(200),
  proof: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(128),
});

export const inviteMemberSchema = z.strictObject({
  email: z.email().max(254).transform((s) => s.trim().toLowerCase()),
  // Step 6 will introduce the complete five-role permission system.
  // All Step 5 invites enter as default members without project privileges.
  role: z.literal("member").default("member"),
});
