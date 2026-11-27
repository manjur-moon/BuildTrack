import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
test('document API authenticates, enforces same origin and private downloads',()=>{
 const post=read('src/app/api/v1/expense-documents/route.ts');
 for(const value of ['requireAuthorizationContext(request.headers)','assertSameOrigin(request)','requiredIdempotencyKey(request.headers)','parseJson(request,documentInput)'])assert.ok(post.includes(value));
 const get=read('src/app/api/v1/expense-documents/[documentId]/content/route.ts');
 assert.match(get,/requireAuthorizationContext/);assert.match(get,/private, no-store/);
});
test('expense evidence writes lock parent, verify recorder and guard posted state',()=>{
 const s=read('src/server/expense-documents/service.ts');
 for(const value of ['requireLiveProjectLock','assertCurrentWriteAccess','expense.recordedByMembershipId !== actor.membershipId','expense.status !== "DRAFT"','verifyVersion','await bump(tx,expense)','status:"PENDING"','crypto.randomUUID()','inventoryWrite','await audit'])assert.ok(s.includes(value),value);
 assert.match(read('src/server/finance/service.ts'),/Complete or remove pending expense documents before posting/);
 assert.match(read('src/server/media/service.ts'),/deletedAt: null, expenseId: null/);
});
test('PDF bounded body and attachment download; separate final object key',()=>{
 const s=read('src/server/media/storage.ts');
 for(const value of ['readBoundedBody','looksLikePdf(input)','ContentDisposition: \'attachment;','ResponseContentDisposition: `attachment;','expiresIn: 60'])assert.ok(s.includes(value),value);
 assert.match(read('src/server/expense-documents/service.ts'),/expense-documents\/\$\{actor.organizationId\}\/\$\{pending.id\}\/\$\{crypto.randomUUID\(\)\}/);
});
