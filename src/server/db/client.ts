import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/server/env";

const globalForPrisma = globalThis as unknown as { buildtrackPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const { DATABASE_URL } = getServerEnv();
  const adapter = new PrismaPg({ connectionString: DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

/** Import from server-side code only; keep a single pool during development hot reloads. */
export const prisma = globalForPrisma.buildtrackPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.buildtrackPrisma = prisma;
