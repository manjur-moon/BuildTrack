# Step 13A — Hardening and completion audit

Baseline: BuildTrack-main.zip plus the three Step 12 replacement patches; user's local Step 12 tests reported successful. Local changes after those patches are not visible to this review.

## Security changes
- All ten inventory write operations now supply a replay authorization callback. The normal lookup and P2002 recovery both recheck current database-backed access before returning a response. The ordinary write checks remain in place.
- Fingerprints now include membership ID and version 2. Existing inventory keys with old fingerprints return 409 rather than executing again; reconcile the original transaction before resubmitting. Do not issue a fresh key blindly for an operation of unknown outcome.
- A closed/archived site or revoked grant can deny replay even if the original request succeeded. No schema or migration changes.
- New mocked replay tests and an isolated database regression cover authorized replay, cross-actor denial, revoked grant, and no extra writes/audit. Full tests still require the user's environment.
- Two stale foundation tests are updated: check preservation of all 40 named models instead of an obsolete count of 39, and check presence of implemented APIs instead of requiring projects to be absent.

## Completion blockers from master requirements
- Finance: budget revisions, posted/voided expense lifecycle, authoritative financial analytics and attachment flows are not implemented as complete modules in the inspected baseline. Models alone do not establish functionality.
- Contractors: company directory, contractor-specific project/task access and performance history need completion and verification.
- Tasks: dependency DAG, milestone workflows and persistent drag/drop Kanban require completion/verification.
- Daily progress reporting, notifications and activity log require functional interfaces and services.
- Dashboard overview currently displays unconnected metric placeholders; finance and reports are generic placeholder pages.
- Comprehensive relational demonstration seed and Playwright E2E coverage not demonstrated.
- Construction idempotency helper has a similar early replay return; review each caller before deployment. Do not interpret the inventory fix as covering other namespaces.

## Validation
Node static tests: 25 passed, 0 failed on patched archive (Node 22.16.0); production target requires Node 24. No installed project dependencies or local PostgreSQL available in review environment. Vitest, integration, lint, full type-check, build and E2E remain local requirements. Existing integration fixtures intentionally remain in isolated local test database. No deployment until missing P0 modules and security work are completed.
