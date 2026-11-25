# BuildTrack — Step 6D: Database-Backed RBAC Security Integration

## Scope and status

This is an **integration test candidate**, not a claim that it already passed on the user's Windows project. It exercises the Step 6C grant/revoke service against real PostgreSQL tables, audit events, uniqueness, project/site prerequisites, cross-tenant foreign keys, and unauthenticated API denial. It does **not** fully test authenticated HTTP role-management flows, cookie sessions, simultaneous grant/revoke races, or transactional domain writes. These remain gates before Step 6 completion.

### Safety first

- **Run against `buildtrack_auth_test` only.** The test file requires `RUN_RBAC_INTEGRATION=1` plus an explicitly provided `DATABASE_URL` for `buildtrack_auth_test` at `localhost:5433`. It refuses `buildtrack_dev` even if `.env` points there.
- The test writes **temporary isolated fixtures** and deletes only those fixtures in `afterAll`. Never use real customer data, staging, or production.
- The test performs no schema migration, reset, or table truncation.
- It loads `.env` only for required Better Auth environment variables; `override:false` preserves the explicitly selected test database.
- A hard process crash can leave test fixtures; names have a unique `step6d-*` prefix so they can be identified, but do not indiscriminately delete any records.

## Install

1. Extract ZIP outside BuildTrack project.
2. Copy `tests/rbac/rbac.integration.test.ts` into your existing project at the same relative path.
3. Ensure Step 6A, 6B and 6C files already exist and all unit tests and typechecks are passing.
4. Ensure test database migration status is up-to-date and `operational_role_assignment` table exists.

## Run (Windows PowerShell)

Use the *same* PowerShell window for all commands:

```powershell
cd "C:\Users\manju\Downloads\buildtrack\buildtrack"

# Remove an old override from another task.
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue

# Derive the isolated DB URL without printing credentials.
$testUrl = node -e "const fs=require('node:fs');const dotenv=require('dotenv');const raw=dotenv.parse(fs.readFileSync('.env')).DATABASE_URL;if(!raw)throw Error('Missing DATABASE_URL');const u=new URL(raw);if(u.pathname!=='/buildtrack_dev'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='5433')throw Error('Unexpected source database');u.pathname='/buildtrack_auth_test';process.stdout.write(u.toString())"
if ($LASTEXITCODE -ne 0 -or -not $testUrl) { throw "Failed to select isolated test database" }
$env:DATABASE_URL = $testUrl
Remove-Variable testUrl

# Print only safe connection metadata.
node -e "const u=new URL(process.env.DATABASE_URL);console.log('Database:',u.pathname.slice(1),'Host:',u.hostname,'Port:',u.port)"

npx prisma migrate status
# Verify output explicitly names buildtrack_auth_test and is up to date.

$env:RUN_RBAC_INTEGRATION = "1"
npm run test -- tests/rbac/rbac.integration.test.ts --testTimeout=30000 --maxWorkers=1

# Clear overrides in this shell after testing.
Remove-Item Env:RUN_RBAC_INTEGRATION -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

## Test inventory (14)

1. Non-owner cannot grant a role; no audit entry.
2. Owner cannot self-grant.
3. Cross-tenant member cannot be granted.
4. Project role requires corresponding active project membership.
5. Valid project grant is recorded with exactly one audit event.
6. Duplicate live grant is rejected by DB unique index.
7. Project scope and live assignment snapshot govern permissions.
8. Revocation records audit and disables active grant.
9. Repeat revocation fails.
10. Site engineer grant without site assignment fails.
11. Site engineer grant after site assignment succeeds.
12. PostgreSQL rejects invalid role/scope.
13. PostgreSQL rejects mismatched tenant/project foreign key.
14. Unauthenticated context endpoint returns 401.

## Why this does not close Step 6 on its own

- No actual signed Better Auth session is used for successful grant/revoke HTTP tests. The service tests build a **synthetic actor context** representing a DB-backed owner. This is intentional: the suite isolates transactional grant logic; a separate HTTP E2E suite must verify session-to-context resolution and active organization selection.
- No business CRUD routes exist yet to exercise all resource guards; Step 8 must include full authorization tests for any new CRUD API.
- Project membership revocation race protection should be reviewed for financial/inventory writes and any future multi-step operations.
- Better Auth session revocation, ownership transfer and concurrent requests need additional integration coverage.
- Previously disclosed PostgreSQL credentials must be rotated before deployment.
