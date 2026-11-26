import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
test("pins compatible Prisma 7 dependencies", () => {
  assert.equal(packageJson.dependencies["@prisma/client"], "7.10.1");
  assert.equal(packageJson.devDependencies.prisma, "7.10.1");
  assert.equal(packageJson.dependencies["@prisma/adapter-pg"], "7.10.1");
});
test("pins patched Better Auth", () => {
  assert.equal(packageJson.dependencies["better-auth"], "1.7.16");
});
test("has approved Step 3 schema changes", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model IdempotencyRecord\s*\{/);
  assert.match(schema.match(/model ContractorUser \{[^}]*\}/s)?.[0] ?? "", /endedAt\s+DateTime\?/);
  // Additive migrations are allowed; previously approved models must remain.
  const models = new Set([...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]));
  for (const name of ["User", "Session", "Account", "Verification", "Organization", "Member", "Invitation", "OrganizationSettings", "Project", "ProjectMember", "ConstructionSite", "SiteAssignment", "Milestone", "Task", "TaskAssignment", "TaskDependency", "TaskComment", "TaskStatusHistory", "ContractorCompany", "ContractorUser", "ProjectContractorAssignment", "ProjectBudget", "BudgetRevision", "ExpenseCategory", "Expense", "MaterialCategory", "Material", "SiteInventory", "MaterialRequest", "MaterialRequestItem", "MaterialIssue", "MaterialIssueItem", "StockMovement", "MaterialUsageRecord", "DailyProgressReport", "FileAttachment", "Notification", "AuditEvent", "IdempotencyRecord", "OperationalRoleAssignment"]) {
    assert.ok(models.has(name), `Missing approved model: ${name}`);
  }
});
test("preserves approved API contract and frontend reference", () => {
  assert.ok(existsSync(new URL("../docs/api/openapi.yaml", import.meta.url)));
  assert.ok(existsSync(new URL("../design/references/reference-01.png", import.meta.url)));
});
test("preserves Better Auth and implemented business API routes", () => {
  assert.ok(existsSync(new URL("../src/app/api/auth/[...all]/route.ts", import.meta.url)));
  assert.ok(existsSync(new URL("../src/app/api/v1/auth/register/route.ts", import.meta.url)));
  for (const route of ["projects", "sites", "tasks", "materials", "inventory"]) {
    assert.ok(existsSync(new URL(`../src/app/api/v1/${route}/route.ts`, import.meta.url)), `Missing route: ${route}`);
  }
});
test("never commits production secrets", () => {
  assert.match(read(".gitignore"), /^\.env$/m);
});
