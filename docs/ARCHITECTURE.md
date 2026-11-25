# BuildTrack — Step 5 Architecture

- **Next.js App Router**: neutral temporary auth pages, dynamic `/account` page, catch-all Better Auth route.
- **Better Auth**: Prisma adapter, sessions, email/password, verification, reset, organization invitations; pinned patched 1.7.16.
- **Invitation gate**: server-only signup HMAC proof; independent 256-bit emailed registration proof hashed in namespaced Better Auth `Verification` records; require verified email before invitation acceptance.
- **Membership**: schema-backed organization `Member`, with `disabledAt`. Owner bootstrap is dev-only; full 5-role authorization is deferred to Step 6.
- **Prisma 7**: `@prisma/adapter-pg`, existing approved schema, reviewed migration gate.
- **SMTP**: Nodemailer; Mailpit local Docker option; production TLS required.
- **API foundation**: Zod strict contracts, standardized errors, no-store authenticated responses.
- **Design**: previous reference stored at `design/references/reference-01.png`. No dashboard or final branding UI implemented.
- **Future work**: application RBAC, project/site scoped queries, operational endpoints, audit, shared distributed rate limiting.

**Never infer** that frontend navigation protection substitutes for server authorization. See `docs/STEP5_AUTHENTICATION.md` for tests and limitations.
