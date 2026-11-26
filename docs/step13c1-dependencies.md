# Step 13C.1 — task dependencies
Reuses existing TaskDependency model and database constraints. Project row lock serializes graph edits and task progress. Only authorized task editors may manage prerequisites. Others see a blocked flag, not prerequisite identities. Completed tasks cannot change prerequisites. Archiving a prerequisite of an active (non-archived) successor is rejected. Adding/removing a dependency is state-idempotent and audited only on change. No schema migration required.

Run `npm run typecheck`, `npm run test -- tests/construction/dependency-graph.test.ts`, and the existing task integration suite with RUN_TASK_INTEGRATION=1 and explicit localhost:5433/buildtrack_auth_test DATABASE_URL. Run lint and build. No production database tests.

Limitations: candidate picker limited to first 100; integration tests not run in patch preparation environment. Contractor, milestone, progress reporting and construction replay authorization remain separate work. Finance outstanding work remains release-blocking.
