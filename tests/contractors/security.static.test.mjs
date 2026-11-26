import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('contractor route requires session, origin and idempotency',()=>{const s=read('src/app/api/v1/contractors/route.ts');for(const token of ['requireAuthorizationContext(request.headers)','assertSameOrigin(request)','requiredIdempotencyKey(request.headers)','parseJson(request,contractorInput)'])assert.ok(s.includes(token));});
test('contractor writes and replay use live role checks and audit',()=>{const s=read('src/server/contractors/service.ts');for(const token of ['assertCurrentWriteAccess(tx, actor,"role:assign"','tx=>authorize(tx,actor)','await authorize(tx,actor)','FOR UPDATE','await audit(tx,actor','revokedByMembershipId:actor.membershipId'])assert.ok(s.includes(token));});
