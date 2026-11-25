import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getServerEnv } from "../src/server/env";

const adapter = new PrismaPg({ connectionString: getServerEnv().DATABASE_URL, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter });
try {
  await db.$queryRaw`SELECT 1`;
  console.log("PostgreSQL connection: PASS");
} catch (error) {
  const err = error as {
    code?: string;
    message?: string;
    cause?: { code?: string };
  };

  console.error("PostgreSQL connection: FAIL");
  console.error("Error code:", err.code ?? err.cause?.code ?? "unknown");
  console.error("Error message:", err.message ?? "unknown");

  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
