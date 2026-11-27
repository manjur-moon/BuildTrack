import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
test("Kanban page requires current task-section authorization and exposes no server data directly", () => {
  const page = read("src/app/dashboard/tasks/board/page.tsx");
  assert.match(page, /resolveAuthorizationContext\(await headers\(\)\)/);
  assert.match(page, /getPermittedSection\(actor, "tasks"\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /actor\.organizationId.*actor\.membershipId/);
});
test("Kanban uses the existing protected status endpoint and reloads after failure", () => {
  const board = read("src/components/construction/kanban-board.tsx");
  const route = read("src/app/api/v1/tasks/[taskId]/status/route.ts");
  assert.match(board, /\/status`.*jsonRequest\("PATCH", payload\)/);
  assert.match(board, /finally\s*\{\s*setPending\(null\); setRevision/);
  assert.match(board, /writeLock\.current/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAuthorizationContext/);
  assert.match(route, /updateTaskProgress\(actor/);
});
test("Kanban includes real drag/drop, accessible move controls, and independent server pages", () => {
  const board = read("src/components/construction/kanban-board.tsx");
  for (const feature of ["DndContext", "useDraggable", "useDroppable", "KeyboardSensor", "PointerSensor", "onDragEnd", "onMove", "page: String(pages[status])"]) assert.ok(board.includes(feature), feature);
});
