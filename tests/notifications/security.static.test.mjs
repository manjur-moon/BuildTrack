import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");
test("notification routes require authenticated context and same origin for mutations", () => {
  const route = read("src/app/api/v1/notifications/route.ts");
  assert.equal([...route.matchAll(/await requireAuthorizationContext\(request.headers\)/g)].length, 2);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /parseJson\(request, inboxMutation\)/);
});
test("notification queries and updates use the current recipient scope and deduplicate refresh", () => {
  const service = read("src/server/notifications/service.ts");
  assert.match(service, /organizationId: actor.organizationId, recipientMembershipId: actor.membershipId/);
  assert.match(service, /updateMany\(\{ where: \{ \.\.\.scope, id: input.id/);
  assert.match(service, /skipDuplicates: true/);
  assert.match(service, /actor.membershipId, dhakaDate\(now\), type/);
});
test("activity history checks live audit permission, never projects raw snapshots and has no mutation route", () => {
  const service = read("src/server/notifications/service.ts");
  const audit = service.slice(service.indexOf("export async function listActivity"));
  assert.match(audit, /assertCurrentWriteAccess\(tx, actor, "audit:view"/);
  assert.match(audit, /organizationId: actor.organizationId/);
  assert.doesNotMatch(audit, /before: true|after: true|ipAddress: true/);
  assert.doesNotMatch(read("src/app/api/v1/activity/route.ts"), /export async function (POST|PATCH|DELETE|PUT)/);
});
