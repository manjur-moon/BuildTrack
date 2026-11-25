import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Better Auth route is mounted with Next.js handler", () => {
  assert.match(read("src/app/api/auth/[...all]/route.ts"), /toNextJsHandler\(auth\)/);
});
test("registration requires server signed proof and verified invitation", () => {
  assert.match(read("src/server/auth/auth.ts"), /verifyInternalSignupProof/);
  assert.match(read("src/app/api/v1/auth/register/route.ts"), /validateRegistrationInvitation/);
  assert.match(read("src/server/auth/auth.ts"), /requireEmailVerificationOnInvitation: true/);
});
test("mail service and login pages are included without redesigning landing page", () => {
  assert.ok(existsSync(new URL("../src/app/login/page.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../src/server/auth/email.ts", import.meta.url)));
  assert.ok(existsSync(new URL("../design/references/reference-01.png", import.meta.url)));
});
test("signed proof cryptographic behavior passes with native TypeScript stripping", () => {
  const modulePath = new URL("../src/server/auth/internal-proof.ts", import.meta.url).href;
  const script = `import {createInternalSignupProof,verifyInternalSignupProof} from ${JSON.stringify(modulePath)};const s='long-and-unique-secret-for-tests';const p=createInternalSignupProof('User@example.test','invitation-signup',s,1000);if(verifyInternalSignupProof(p,'user@example.test',s,2000)!=='invitation-signup'||verifyInternalSignupProof(p,'attacker@example.test',s,2000)!==null||verifyInternalSignupProof(p,'user@example.test',s,100000)!==null)process.exit(1)`;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
