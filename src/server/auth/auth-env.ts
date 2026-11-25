import { z } from "zod";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters").refine(s => !s.includes("REPLACE"), "Generate a real random secret"),
  BETTER_AUTH_URL: z.url().refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  }, "Use HTTPS outside localhost"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_FROM: z.string().min(3),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export function getAuthEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid authentication environment: ${parsed.error.issues.map(x => x.path.join(".")).join(", ")}`);
  }
  if (!!parsed.data.SMTP_USER !== !!parsed.data.SMTP_PASSWORD) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must both be set or both be empty");
  }
  return parsed.data;
}
