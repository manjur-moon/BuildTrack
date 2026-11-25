# Step 5 — Better Auth authentication, invite-only onboarding

## Status

Code is implemented in this deliverable, **not claimed integrated or deployed**. Offline Node checks pass. `npm install`, `npx prisma validate`, schema generator, SMTP delivery, real PostgreSQL integration, `tsc`, `eslint`, `vitest`, and `next build` must run in the user's environment before approval.

## Architecture

- Better Auth 1.7.16, fixed security release (the project pins it, no unpinned `@latest`).
- Prisma 7 adapter via existing `@prisma/adapter-pg` client.
- `/api/auth/[...all]` — Better Auth endpoints; signup is **denied unless a server-signed proof is presented**.
- `/api/v1/auth/register` — validates invitation ID and separate SHA-256-hashed registration proof stored in `Verification`; derives email from invitation; calls Better Auth signup with an internal 60-second HMAC proof; never accepts role or user ID from the browser.
- `/api/v1/auth/invitations` — authenticated, verified **owner only**, and role always `member`; Better Auth also checks organization membership.
- `/api/v1/auth/me` — authenticated user and active organization memberships.
- `emailAndPassword.requireEmailVerification: true`, 12-character minimum password; SMTP verification, reset and invitation delivery.
- Organization creation, role changes and privileged organization mutation routes are blocked until Step 6. User creation is invitation-only, except **explicit local development bootstrap**.
- Better Auth recipient invitation acceptance requires a verified email session.
- Step 5 temporary pages: `/login`, `/register`, `/accept-invitation`, `/forgot-password`, `/reset-password`, `/account` (not the approved final dashboard UI).

## Invitation flow

1. A local owner account is bootstrapped into a **fresh development database**. This is not a production provisioning feature.
2. Owner logs in and sends invitation through `/account` (temporary) or authenticated API.
3. Better Auth writes an `Invitation` and calls `sendInvitationEmail`; BuildTrack creates a random 256-bit registration proof, stores its hash in `Verification` using a namespaced identifier, and sends the link to the invited mailbox.
4. Invitee opens `/register?invitationId=...&proof=...`, submits name/password. Server validates pending invitation, expiry and proof. Direct `/api/auth/sign-up/email` without signed internal authorization is rejected.
5. Better Auth creates an unverified account and sends verification email. Registration proof is consumed after successful sign-up.
6. Invitee clicks verification email, signs in and visits `/accept-invitation?id=...`. Better Auth checks verified email ownership and organization invitation state before adding the membership.
7. Owner and new member can view `/account`. New members have no operational project authorization before Step 6.

If the recipient **already has a Better Auth account**, they should sign in, verify email if needed, and accept the invitation without creating a second account.

### Security controls

- Never accept arbitrary roles, organization IDs, email addresses, or membership IDs from a registration request.
- Require verified email before sign-in and invitation acceptance.
- Only owner can issue member-role invitations at this step; role mutation is blocked.
- Server-signed HMAC proof prevents bypassing the public Better Auth signup endpoint. Signature is 60 seconds, purpose-scoped, and never exposed to client.
- Registration proof is 32 random bytes; database stores only its SHA-256 digest. It expires no later than the invitation. Invitation links are bearer credentials: do not paste them in logs, screenshots, or analytics.
- Basic Better Auth rate limiting is not a replacement for shared edge or database-backed controls in multi-instance production. Add durable shared rate limiting before production deployment.
- Production SMTP must support TLS. No insecure public HTTP verification/invitation URLs.
- For future production bootstrap, use an audited operations runbook; **never** run the local development bootstrap on a real company's database.
- The `User` identity can exist before an invitation is accepted, but no operational access is granted without a verified, active membership and subsequent Step 6 RBAC checks.
- Verify schema model mappings and `auth generate` output before migrations. Do not overwrite previously applied migrations or run `db push`.

### Known design limitations

- A 256-bit emailed invitation proof is a bearer token; theft of the entire invite URL plus the recipient's email-verification link can compromise onboarding.
- Registration and proof consumption use separate transactions. Unique user email constraints prevent duplicate successful accounts, but a crash after sign-up before proof cleanup may leave a proof until expiry. This does not grant a second account; monitor failures and clear stale challenges.
- An email delivery failure after account creation may require resending verification; do not claim SMTP succeeded until tested.
- Invitation send rate limits, audit event integration, and full five-role controls are not implemented yet.
- The initial owner has Better Auth's `owner` plugin role for bootstrap. Step 6 must explicitly map it to BUILDTRACK ADMIN authorization, define five role permissions, and restrict by active organization/project/site membership.

## Local setup — PowerShell

From the BuildTrack project root (Node.js 24 LTS):

```powershell
nvm use 24.18.0
npm install
Copy-Item .env.example .env  # only if .env does not already exist
# Edit .env, keep current DATABASE_URL; set a random 32+ character BETTER_AUTH_SECRET
# Configure SMTP_* (Mailpit below) and BETTER_AUTH_URL to http://localhost:3000
npm run test:smoke
npm run db:auth-schema
npm run db:auth-check
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

**Migration check:** If the database already has an approved Step 4 migration, do **not** regenerate or replace it. The schema-only generator deliberately does not import the runtime Prisma client; its schema-affecting options must match `src/server/auth/auth.ts`. Compare the schema against Better Auth's pinned generated schema, then use `npm run db:migrate:status` and `npm run db:check`. If schemas differ, prepare a new reviewed **additive migration** and apply to a disposable/test database first. If the initial migration was never prepared, follow `docs/MIGRATION_GATE.md` before setting up auth.

Optional local SMTP inbox (requires Docker):

```powershell
docker compose -f docker-compose.auth.yml up -d
# Mailpit: http://localhost:8025 ; SMTP: localhost:1025
```

Generate a secure secret (do not paste it into chat):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

### First development owner (only if new empty development database)

Set **temporary environment variables in your current PowerShell session**. Do not commit passwords or save them in source:

```powershell
$env:BUILDTRACK_BOOTSTRAP_ENABLED="yes"
$env:BOOTSTRAP_NAME="Demo Owner"
$env:BOOTSTRAP_EMAIL="owner@example.test"
$env:BOOTSTRAP_PASSWORD=Read-Host "Dev owner password (12+ chars)"
$env:BOOTSTRAP_ORG_NAME="BuildTrack Demo Construction"
$env:BOOTSTRAP_ORG_SLUG="buildtrack-demo"
npm run auth:bootstrap:dev
$env:BUILDTRACK_BOOTSTRAP_ENABLED="no"
Remove-Item Env:BOOTSTRAP_PASSWORD
```

For development bootstrap, `BUILDTRACK_BOOTSTRAP_ENABLED=yes` must also be active inside the same process that calls the Better Auth API; the script enforces this. The command errors on nonempty databases. **Do not** execute it on any already seeded/approved database. It creates a temporarily verified dev account as a trusted local operation.

### Manual functional tests

1. `npm run dev`; verify `/api/v1/health` remains public and `/account` redirects to `/login` if logged out.
2. `POST /api/auth/sign-up/email` without internal proof: expect `403`; no user created.
3. Bootstrap owner only if database empty, log in to `/login`; open `/account`.
4. Owner invites new email via `/account`, inspect Mailpit inbox, follow `/register` link.
5. Register with 12+ character password; verify direct login denied before email verification.
6. Verify via email, log in, accept invitation, verify membership appears on `/account` and `/api/v1/auth/me`.
7. Try duplicate, expired, and tampered registration proofs; all must fail.
8. Call `/api/auth/organization/invite-member` with role `owner` directly and try `/api/auth/organization/update-member-role`; both must fail.
9. Log out and confirm `/account` and `/api/v1/auth/me` require authentication.
10. Password reset request -> Mailpit -> reset -> login using updated password.

## Test commands

```powershell
npm run test:smoke                 # offline 10 tests
npm run test:auth                  # Vitest unit tests (DB tests skipped by default)
$env:RUN_AUTH_INTEGRATION="1"      # only against a migrated test DB
npm run test:auth
Remove-Item Env:RUN_AUTH_INTEGRATION
npm run typecheck
npm run lint
npm run build
```

The integration tests require a real PostgreSQL database and configured Better Auth environment. Additional Mailpit-backed E2E checks are manual until the UI flows are automated in later phases.
