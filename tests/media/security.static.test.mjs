import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("media init/complete/delete mutations all enforce origin + auth", () => {
  for (const path of [
    "src/app/api/v1/media/init/route.ts",
    "src/app/api/v1/media/[mediaId]/complete/route.ts",
    "src/app/api/v1/media/[mediaId]/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /assertSameOrigin\(request\)/);
    assert.match(source, /requireAuthorizationContext\(request\.headers\)/);
  }
});
test("private media reads require auth and do not return public bucket URLs", () => {
  const source = read("src/app/api/v1/media/[mediaId]/content/route.ts");
  assert.match(source, /requireAuthorizationContext/);
  assert.match(source, /no-store/);
  assert.match(source, /signedPrivateView|getPrivateMediaUrl/);
});
test("no embedded colors outside the existing dashboard theme", () => {
  const css = read("src/components/media/media.css");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
  assert.match(css, /var\(--bt-fg\)/);
});
test("schema migration is additive and uses the existing media model", () => {
  const sql = read("prisma/migrations/20261126180000_step10_site_media/migration.sql");
  assert.match(sql, /ALTER TABLE "FileAttachment" ADD COLUMN "siteId" TEXT/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP COLUMN/i);
});
test("media service never accepts tenant from HTTP input", () => {
  const code = read("src/server/media/service.ts");
  assert.match(code, /organizationId: actor\.organizationId/g);
  assert.match(code, /assertCurrentWriteAccess/);
  assert.match(code, /requireLiveProjectLock/);
  assert.match(code, /status: "READY"/);
});
