# Mandatory pre-migration gate

Initial migration is NOT generated or applied in this package because npm dependency installation and PostgreSQL were unavailable at authoring time. **Do not skip this gate**.

1. Install Node 24.11+ and `npm install` (commit the resulting package-lock.json).
2. Set a **disposable**, non-production PostgreSQL DATABASE_URL in `.env`. Verify the database name carefully.
3. Run `npm run db:auth-schema` to generate `prisma/better-auth.generated.prisma` from pinned Better Auth 1.7.16 with the organization plugin plus disabledAt extra member field.
4. Run `npm run db:auth-check`. Automated parity check handles scalar fields only. A human must reconcile each identity model's keys, defaults, mappings, indexes, and relations before proceeding.
5. Run `npm run db:validate` and `npm run db:generate`. Fix any ORM errors; never suppress them.
6. After manual review set `BUILDTRACK_AUTH_SCHEMA_REVIEWED=yes`, then run `npm run db:migrate:prepare`. This creates a `--create-only` migration, appends PostgreSQL CHECKs/triggers, **does not apply it**.
7. Review generated SQL including all FK relations, trigger ordering, auth model changes, new IdempotencyRecord model and constraints.
8. Set `BUILDTRACK_SQL_REVIEWED=yes` after reviewing the generated SQL; then run `npm run db:migrate:apply` **only on development database**, then `npm run db:migrate:status` and `npm run db:check`.
9. Test that cross-org FK, zero/negative amounts, task cycles, history mutation, posted expense mutation, stock sourcing and simultaneous stock deductions are rejected. Stock concurrency and ledger reconciliation are Step 11 services, so do not claim complete transaction-safety at Step 4.
10. Commit the migration and lock file. Never edit a migration that has already been applied to a shared environment.

`db:auth-schema` is a Better Auth schema-generation blueprint; Step 5 must implement actual session and authorization logic, and may require additional auth-model migration if verified plugin configuration changes.

If auth CLI cannot run without a configured adapter, update the schema-only config to provide Prisma adapter and regenerate, without registering auth endpoints. Never migrate an unreconciled auth schema.
