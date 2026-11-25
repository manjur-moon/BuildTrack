import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "DATABASE_URL must be a PostgreSQL connection URL",
  }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/** Call lazily at runtime, never during static Next.js page compilation. */
export function getServerEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Missing or invalid server environment: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return result.data;
}
