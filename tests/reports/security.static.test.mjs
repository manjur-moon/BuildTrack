import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";
const read=p=>readFileSync(p,"utf8");
test("reports check current session, report scope and selected project",()=>{
 const page=read("src/app/dashboard/reports/page.tsx"),svc=read("src/server/reports/service.ts");
 assert.match(page,/resolveAuthorizationContext\(await headers\(\)\)/);
 assert.match(page,/getPermittedSection\(actor,"reports"\)/);
 assert.match(svc,/AND:\[scope\.where,\{id:projectId\}\]/);
 assert.match(svc,/const base = \{ organizationId, projectId \}/);
 assert.match(svc,/status:"POSTED" as const/);
});
test("top-bar unread count uses the inbox recipient and visibility filter",()=>{
 const svc=read("src/server/notifications/service.ts"),layout=read("src/app/dashboard/layout.tsx");
 assert.match(svc,/recipientMembershipId: actor\.membershipId/);
 assert.match(svc,/count\(\{ where: \{ \.\.\.inboxScope\(actor\), readAt: null \} \}\)/);
 assert.match(layout,/unreadCount=\{await unreadNotificationCount\(context\)\}/);
});
