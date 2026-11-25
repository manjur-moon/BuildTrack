import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Read-only DB structural check. Never use an unexpected target.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const target = new URL(url);
if (target.pathname !== "/buildtrack_auth_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433") {
  throw new Error("BLOCKED: RBAC verification requires the isolated buildtrack_auth_test database");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5000 }) });
const expected = [
  "ora_valid_scope_and_role_chk", "ora_valid_revocation_chk", "ora_valid_expiry_chk", "ora_valid_revocation_time_chk",
  "ora_subject_fk", "ora_grantor_fk", "ora_revoker_fk", "ora_project_fk", "ora_site_fk",
];
const unique = ["ora_unique_active_org", "ora_unique_active_project", "ora_unique_active_site"];
try {
  const constraints = await db.$queryRaw<Array<{ name: string }>>`
    SELECT conname AS name FROM pg_constraint
    WHERE conrelid = 'public.operational_role_assignment'::regclass`;
  const indexes = await db.$queryRaw<Array<{ name: string }>>`
    SELECT indexname AS name FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'operational_role_assignment'`;
  const presentConstraints = new Set(constraints.map((x) => x.name));
  const presentIndexes = new Set(indexes.map((x) => x.name));
  const missing = [
    ...expected.filter((x) => !presentConstraints.has(x)),
    ...unique.filter((x) => !presentIndexes.has(x)),
  ];
  if (missing.length) throw new Error(`Missing RBAC database objects: ${missing.join(", ")}`);
  console.log("RBAC database constraints: PASS");
  console.log("RBAC active-grant uniqueness indexes: PASS");
} catch (e) {
  console.error("RBAC database verification: FAIL", e instanceof Error ? e.message : "unknown error");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
