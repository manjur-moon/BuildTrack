import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('correction migration scopes and freezes replacement links',()=>{
  const sql=read('prisma/migrations/20261127160000_step13e2_expense_corrections/migration.sql');
  assert.match(sql,/FOREIGN KEY \("organizationId", "projectId", "replacementOfId"\)/);
  assert.match(sql,/CREATE UNIQUE INDEX "expense_single_replacement_key"/);
  assert.match(sql,/e\."status" = 'VOIDED'/);
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(sql,/NEW\."replacementOfId" IS DISTINCT FROM OLD\."replacementOfId"/);
});
test('finance corrections retain serialization, maker checker and replay',()=>{
  const s=read('src/server/finance/service.ts');
  assert.match(s,/inventoryWrite\(actor, `finance\.\$\{input\.action\}`, key, input, guard/);
  assert.match(s,/recorderId === actor\.membershipId && hasPermission\(actor,"expense:create"/);
  assert.match(s,/row\.updatedAt\.getTime\(\) !== new Date\(input\.expectedUpdatedAt\)\.getTime\(\)/);
  assert.match(s,/replacementOfId:row\.id/);
  assert.match(s,/"expense:post",\{\.\.\.resource/);
});
