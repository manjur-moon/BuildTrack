#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const models = ["User", "Session", "Account", "Verification", "Organization", "Member", "Invitation"];
const expectedPath = resolve("prisma/schema.prisma");
const generatedPath = resolve("prisma/better-auth.generated.prisma");
if (!existsSync(generatedPath)) {
  console.error("BLOCKED: First generate Better Auth models with `npm run db:auth-schema`.");
  process.exit(1);
}
const expected = readFileSync(expectedPath, "utf8");
const generated = readFileSync(generatedPath, "utf8");
const modelBlock = (text, name) => text.match(new RegExp(`\\bmodel\\s+${name}\\s*\\{([\\s\\S]*?)\\}`, "m"))?.[1];
const fields = (block) => new Map(
  [...block.matchAll(/^\s*([a-zA-Z]\w*)\s+([a-zA-Z]\w*(?:\? |\[\])?)/gm)]
    .map((entry) => [entry[1], entry[2].replace(/\s/g, "")]),
);
let failures = 0;
for (const model of models) {
  const a = modelBlock(expected, model);
  const b = modelBlock(generated, model);
  if (!a || !b) { console.error(`MISSING MODEL ${model} (expected=${!!a}, generated=${!!b})`); failures++; continue; }
  const fa = fields(a); const fb = fields(b);
  // Compare identity scalars only; domain relation arrays are owned by BuildTrack.
  for (const [name, type] of fb) {
    if (!/^(String|Boolean|DateTime|Int|Float|Decimal|Json|BigInt)(\[\]|\?)?$/.test(type)) continue;
    if (fa.get(name) !== type) { console.error(`${model}.${name}: generated ${type}, BuildTrack ${fa.get(name) ?? "MISSING"}`); failures++; }
  }
}
if (failures) {
  console.error(`BLOCKED: ${failures} Better Auth schema differences; reconcile and regenerate before migrating.`);
  process.exit(1);
}
console.log("PASS: Better Auth generated scalar fields are represented in BuildTrack schema.");
console.log("REVIEW REQUIRED: compare table mappings, unique constraints, relation attributes and defaults manually.");
