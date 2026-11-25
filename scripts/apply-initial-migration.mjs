#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
import { join } from "node:path";

if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  console.error("BLOCKED: A development PostgreSQL DATABASE_URL is required.");
  process.exit(1);
}
if (process.env.BUILDTRACK_SQL_REVIEWED !== "yes" || process.env.BUILDTRACK_AUTH_SCHEMA_REVIEWED !== "yes") {
  console.error("BLOCKED: Set BUILDTRACK_SQL_REVIEWED=yes and BUILDTRACK_AUTH_SCHEMA_REVIEWED=yes only after manual review.");
  process.exit(1);
}
const dir = "prisma/migrations";
const migrations = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith("_initial_buildtrack")) : [];
if (migrations.length !== 1) {
  console.error("BLOCKED: Exactly one prepared initial BuildTrack migration must exist.");
  process.exit(1);
}
const migration = readFileSync(join(dir, migrations[0], "migration.sql"), "utf8");
for (const marker of ["CREATE TABLE", "buildtrack_check_dependency_cycle", "idempotency_state_valid", "guard_expense_posting", "inventory_balance_nonnegative"]) {
  if (!migration.includes(marker)) { console.error(`BLOCKED: Migration is missing required SQL marker: ${marker}`); process.exit(1); }
}
console.log("Guardrails found. Applying reviewed migration to configured development database...");
const result = spawnSync("npx", ["--no-install", "prisma", "migrate", "dev", "--config", "prisma7.config.ts"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
