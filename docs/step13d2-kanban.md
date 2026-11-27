# Step 13D.2 — Task Kanban board

Apply this patch after Step 13D.1. Run `npm install --save-exact @dnd-kit/core@6.3.1` locally (updates package.json and package-lock.json). This patch intentionally does not overwrite package files or include node_modules. The stable legacy core API is used for pointer and keyboard sensors and column drops; no sortable package is needed because ordering within a status is server-side due date, not manual rank.

Open Dashboard → Tasks → Open Kanban board. Four independently paginated columns load the existing GET task endpoint with status, search, priority, mine, due-date ordering and 20 items per page. Filters apply on submit. The list remains available for full details and progress edits. No schema or API changes.

The board uses the existing status PATCH endpoint and server-supplied updatedAt, current permissions and blocked hints. All actual enforcement remains server-side. TODO → IN_PROGRESS preserves 0% progress. Moving to TODO resets progress after confirmation; review needs positive progress; completion needs approval and explicit confirmation. A pending projection moves the card without mutating the original snapshot. A rejected or ambiguous request rolls back and refetches. A successful response replaces the projected card with the authoritative response and refetches all columns. Only one mutation is permitted at a time. Network failures may occur after commit; refresh before retrying. No independent ordering or full-board atomic read snapshot is promised.

## Verification
- `npm run typecheck`
- `npm run test -- tests/construction/kanban-rules.test.ts`
- `node --test tests/construction/kanban.static.test.mjs`
- `npm run test:smoke`
- `npm run lint`
- `npm run build`
- Run existing task integration suite with the verified isolated database and RUN_TASK_INTEGRATION=1.
- Browser: use both mouse drag and keyboard/button fallback; invalid moves, blocked dependencies, reviewer access, completed cards, stale timestamp from another tab, request failure (offline/restore network), refresh, pagination, filters, phone and narrow desktop layouts. Confirm status and audit history in the task list; verify a contractor cannot see another user's work. No browser/E2E or DB tests were run in the patch environment.

Remaining: query-string-backed board filters, custom within-column ordering, project/site selectors on this board, Playwright browser coverage, and release blockers from earlier modules. The existing list retains its full filtering and editing capabilities.
