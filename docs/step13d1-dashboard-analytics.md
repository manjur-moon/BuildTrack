# Step 13D.1 — live dashboard analytics

The existing `/dashboard` now uses server-rendered, permission-scoped analytics. The caller resolves the current session/organization using `resolveAuthorizationContext`; client-supplied organization IDs and roles are not accepted. Scope functions use the existing RBAC policy. Project-wide task progress/risk requires both full project access and project-wide task permission, and contractor task queries use the existing assignment predicate. Multi-role accounts see the metrics permitted by the union of their grants, with project-wide metrics restricted to the intersection of the two permissions. Financial data is not returned for accounts without expense-view permission. No new endpoint, schema migration or dependency is needed.

Metrics exclude archived projects; project progress averages non-archived tasks, zero when no tasks. Completion rate excludes cancelled projects; empty denominator displays N/A. Delayed projects are incomplete/non-cancelled projects with expected end date before today; at-risk projects have overdue incomplete tasks before their expected end date. Due dates use the Asia/Dhaka calendar. Low stock matches the existing inventory rule (positive threshold and stock at/below it). Reports today are counts by work date, not an inferred list of missed reports. Contractor report counts only include own reports on currently accessible tasks.

Money is calculated in exact integer minor units and only POSTED expenses contribute to actual cost. Remaining and utilization are calculated for budgeted projects only; unbudgeted spend is exposed separately and explicitly. The monthly chart is a six-month calendar trend through today's date. Totals exclude archived projects and the chart groups by expense date, not posting date. Current financial totals include all POSTED expenses (including future-dated entries if the existing workflow permits them). The chart does not include future transaction dates. Project budget currency is BDT; mixed currency is rejected, not summed.

The dashboard reads in a repeatable-read transaction. The chart is an accessible HTML bar visualization, not Recharts; exact values remain visible. The patch avoids changing the dependency lockfile or adding dependencies until the planned chart/Kanban implementation. The portfolio budget calculation loads one row per visible budget/project with posted expense data. Larger organizations require query profiling and potentially SQL-side aggregate optimization. Recent projects and upcoming assigned tasks are intentionally limited to eight each. Finance manager project-wide operational data is not exposed unless an additional appropriate grant exists. No user-facing performance ranking or invented report obligations are introduced.

## Verification

- `npm run typecheck`
- `npm run test -- tests/dashboard/analytics.test.ts tests/dashboard/navigation.test.ts`
- `npm run test:smoke`
- Opt-in `RUN_DASHBOARD_INTEGRATION=1` against localhost:5433/buildtrack_auth_test only: `npm run test -- tests/dashboard/analytics.integration.test.ts`. Fixtures remain in the isolated database; service-level tests use trusted contexts, not actual browser sessions.
- `npm run lint`, `npm run build` (after removing temporary test environment variables)
- Manual role-specific UI checks.

Local container checks: 27 static regression tests passed; six TS/TSX files syntax-transpiled; nine standalone assertion groups passed. No full TypeScript semantic check, Vitest or database integration run here (missing dependencies/database, Node 22 vs required 24).

Pending: Kanban drag-and-drop, notifications, activity history, contractor performance, project timeline, additional finance and contractor functionality, construction idempotency hardening, and browser/accessibility/storage QA. These remain release blockers. No deployment approval is implied by this patch.
