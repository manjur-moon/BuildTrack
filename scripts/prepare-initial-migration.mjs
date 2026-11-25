#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function execute(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!process.env.DATABASE_URL) {
  // dotenv loaded below without importing application code
  if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("postgres")) {
  console.error("BLOCKED: Set DATABASE_URL to a disposable development PostgreSQL database.");
  process.exit(1);
}
execute(process.execPath, ["scripts/verify-auth-schema.mjs"]);
if (process.env.BUILDTRACK_AUTH_SCHEMA_REVIEWED !== "yes") {
  console.error("BLOCKED: Complete manual Better Auth schema review and set BUILDTRACK_AUTH_SCHEMA_REVIEWED=yes.");
  process.exit(1);
}
execute("npx", ["--no-install", "prisma", "validate", "--config", "prisma7.config.ts"]);
const folder = "prisma/migrations";
const existing = existsSync(folder) ? readdirSync(folder).filter(x => x.endsWith("_initial_buildtrack")) : [];
if (existing.length) { console.error("BLOCKED: Initial migration already exists; do not silently append duplicate guards."); process.exit(1); }
execute("npx", ["--no-install", "prisma", "migrate", "dev", "--create-only", "--name", "initial_buildtrack", "--config", "prisma7.config.ts"]);
const created = readdirSync(folder).filter(x => x.endsWith("_initial_buildtrack"));
if (created.length !== 1) { console.error("Expected exactly one new initial_buildtrack migration."); process.exit(1); }
const sqlFile = join(folder, created[0], "migration.sql");
const guards = readFileSync("prisma/sql/constraints.after_initial_migration.sql", "utf8");
appendFileSync(sqlFile, "\n-- BuildTrack reviewed SQL guardrails\n" + guards + "\n");
console.log(`Prepared ${sqlFile}. REVIEW THE SQL before running npm run db:migrate:apply.`);
