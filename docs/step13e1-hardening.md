# Step 13E.1 — Construction replay hardening

This is the first QA/remediation checkpoint, not a release certification. The baseline is the original ZIP plus previously supplied patches. Local edits (including the progress Link lint fix, navigation expectation fix and installed package lock changes) are not included in this patch and should be retained.

## Change

Construction project creation, site creation, task creation and staff enrollment formerly returned stored idempotent responses before live authorization. All four now provide a mandatory resource-specific replay authorization callback. Both normal and P2002 recovery paths use the same checked replay function within a transaction. The fingerprint includes version and membership ID; replay verifies active, verified membership and the appropriate current permission. Archived project/site/task records are not replayed. Revoked or expired enrollment records are rejected. No schema or dependency changes. Business writes and audit behavior remain unchanged.

Legacy hashes deliberately return HTTP 409 rather than risk exposing data or repeating a mutation. Before retrying an ambiguous old request, reconcile the original resource or audit record; do not blindly issue a new key. Cached successful results are original response snapshots, not a fresh resource read. Use GET for current data. Authorization is checked at replay time; no claim of absolute race-free revocation across all auth subsystems is made.

## Verification

Container: Node 22, dependencies and generated Prisma client unavailable. Ran all nine existing static test files (35 assertions passed), TypeScript syntax transpilation (7 files), and an isolated standalone harness against the actual transpiled helper (8 scenarios passed). Vitest, semantic TypeScript checking, PostgreSQL and build have not been executed here.

Local (Node 24, installed dependencies):

- `npm run typecheck`
- `npm run test -- tests/construction/idempotency.test.ts`
- `npm run test:smoke`
- Use an explicit local PostgreSQL URL for `buildtrack_auth_test` on port 5433. Confirm migrations are up to date. Set `RUN_CONSTRUCTION_REPLAY=1`, then `npm run test -- tests/construction/replay.integration.test.ts`. Expected one scenario, not skipped. Also set `RUN_CONSTRUCTION_HARDENING=1`, `RUN_STAFF_INTEGRATION=1`, and `RUN_TASK_INTEGRATION=1` and run their respective integration files. Fixtures remain in the isolated test database by design.
- Clear temporary integration flags and DATABASE_URL before running the development server or production build. Do not run against a production DB.
- `npm run lint` and `npm run build`.

## Open release gates

| Priority | Gate | Evidence required |
| --- | --- | --- |
| P0 | Construction replay hardening | Local unit/integration and build pass |
| P0 | Finance attachments, draft editing, void/replacement links and initial budget on project creation | Implement and verify finance invariants and RBAC |
| P0 | Contractor scope and photo access; task assignment isolation | Dedicated role/resource integration and direct API scenarios |
| P0 | Demo seed and five-role accounts | Reproducible isolated seed, minimum counts from master prompt, no real credentials |
| P0 | Private storage | Local MinIO test bucket, authenticated access and unauthorized denial with real bytes |
| P0 | Full regression and Playwright | All mandatory integration suites actually run; E2E plus mobile/accessibility and production build |
| P1 | Remaining product requirements | Scoped contractor directory, selectors, report detail, notification automation, required stack/UX gaps |
| P2 | Gantt and bonus features | Only after mandatory gates |

Proposed sequence: 13E.1 construction security; 13E.2 mandatory functional gap closure (may need smaller checkpoints); 13E.3 seed and browser/DB/storage QA; 13E.4 release evidence and final acceptance audit. No Step 14 until all mandatory gates are resolved or explicitly descoped with a documented decision.
