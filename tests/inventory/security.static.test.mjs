import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Step 12 uses the existing inventory schema and preserves custom Prisma client", () => {
  const client = read("src/server/inventory/transaction.ts");
  assert.match(client, /@\/generated\/prisma\/client/);
  const schemaPath = path.join(root, "prisma/schema.prisma");
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    for (const model of ["Material", "SiteInventory", "MaterialRequest", "StockMovement", "MaterialUsageRecord"]) {
      assert.match(schema, new RegExp(`model\\s+${model}\\s*\\{`));
    }
  }
});
test("stock movements have tenant/site lock, nonnegative guard, and audit", () => {
  const stock = read("src/server/inventory/stock.ts");
  assert.match(stock, /lockedSite\(/);
  assert.match(stock, /requireWithin\(balance/);
  assert.match(stock, /stockMovement\.create/);
  assert.match(stock, /await audit\(/);
});
test("issue uses approved quantity and site stock guards, not unrestricted ISSUE endpoint", () => {
  const request = read("src/server/inventory/requisitions.ts");
  assert.match(request, /quantityApproved/);
  assert.match(request, /Insufficient stock/);
  assert.match(request, /request\.issue/);
  assert.match(request, /request\.requestedByMembershipId === actor\.membershipId/);
  const moves = read("src/server/inventory/input.ts");
  assert.match(moves, /\["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"\]/);
});
test("consumption is not a stock deduction", () => {
  const usage = read("src/server/inventory/usage.ts");
  const consume = usage.slice(usage.indexOf("export async function consumeIssued"), usage.indexOf("export async function returnIssued"));
  assert.doesNotMatch(consume, /siteInventory\.update/);
  assert.match(consume, /materialUsageRecord\.create/);
});
test("all mutation routes are origin-checked and idempotent", () => {
  const routes = path.join(root, "src/app/api/v1");
  const list = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(folder, entry.name);
    return entry.isDirectory() ? list(p) : p.endsWith("route.ts") ? [p] : [];
  });
  let writes = 0;
  const namespaces = ["materials", "material-categories", "material-requests", "inventory", "material-issues"];
  for (const p of list(routes).filter((file) => namespaces.some((part) =>
    file.includes(`${path.sep}api${path.sep}v1${path.sep}${part}${path.sep}`)))) {
    const source = fs.readFileSync(p, "utf8");
    if (/export async function (POST|PATCH)/.test(source)) {
      writes++;
      assert.match(source, /assertSameOrigin\(request\)/, p);
      assert.match(source, /requiredIdempotencyKey\(request\.headers\)/, p);
    }
  }
  assert.ok(writes >= 8);
});
