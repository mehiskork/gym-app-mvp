# Flyway / Postgres Migration Rollback

Use this when a backend deployment fails because of a Flyway/Postgres migration, or when `/ready` reports Flyway/schema readiness failures. This is intentionally operational and conservative for a solo/early-stage TrainFrame deployment.

Related docs:

- [Railway backend deployment](./railway-deployment.md)
- [Production incident runbook](./ops-runbook.md)
- [Account deletion design](./account-deletion-design.md)

## Before Applying A Migration

Before deploying a migration:

- Back up the Railway Postgres database if possible.
- Review the Flyway SQL in `apps/backend/src/main/resources/db/migration`.
- Confirm the migration has been tested locally and in CI.
- Confirm expected `/ready` behavior after the migration.
- Avoid destructive migrations without an explicit backup/restore plan.
- Confirm the backend code being deployed is compatible with both startup and readiness checks.

For production/public users, do not depend on "we can reset the database" as the rollback plan.

## If Migration Fails During Deploy

Immediate actions:

- Stop further deploy attempts until the database state is understood.
- Preserve Railway deployment logs and Flyway error output.
- Check whether the backend is still serving the previous deployment.
- Check `/health` and `/ready`.
- Inspect `flyway_schema_history`.
- Determine whether the migration was not applied, applied and rolled back, partially applied, or applied but marked failed.

PostgreSQL DDL is transactional in most common cases, but do not assume blindly. Some statements and manual changes can leave partial state. Inspect the actual schema before editing Flyway history or redeploying.

## Flyway Schema History Checks

Run this against the affected Railway Postgres database:

```sql
SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC;
```

Look for:

- Latest `version` and `description`.
- `success = false` rows.
- A migration version that exists in the table but not in the deployed code.
- A migration file checksum mismatch after a file was edited.
- A migration marked successful even though expected tables/columns/indexes are missing.

Do not delete or edit `flyway_schema_history` rows until the real database schema state is confirmed.

## Required Table Checks

`/ready` checks database connectivity, Flyway readiness, and required core tables. The current required-table list is documented in [Railway backend deployment](./railway-deployment.md#startup-proof-checklist), and the deployed `/ready` implementation is the source of truth during an incident.

If you need to inspect tables manually, start with:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

If `/ready` reports missing tables, compare its response with `flyway_schema_history` and the migration SQL in the deployed backend version.

## Recovery Procedure

Pick the smallest recovery path that restores database correctness.

If the migration failed before commit:

- Fix the migration SQL.
- Keep the same migration version only if it was never successfully applied in the affected database.
- Redeploy once after review.
- Verify `/ready`.

If partial or manual state exists:

- Stop deploy retries.
- Document the current state with SQL queries and screenshots/log links.
- Document the exact corrective SQL before running it.
- Prefer additive fixes that make the schema match the intended migration.
- Re-run `/ready` after correction.

If the Flyway history row is wrong:

- Confirm actual tables, columns, indexes, and constraints first.
- Confirm whether the migration SQL was fully applied.
- Only remove or edit a Flyway history row after confirming the database state and documenting why Flyway's row is incorrect.
- Keep a backup or restore point before changing Flyway metadata.

If data correctness is uncertain:

- Restore from the latest known good backup.
- Prefer restoring over guessing when user data may be corrupted or partially transformed.
- After restore, deploy a known-compatible backend and run `/ready`.

## Roll Forward Preferred

Prefer a new corrective migration over editing already-applied migration files in production.

Never modify an applied migration file in a deployed environment unless the database is being reset intentionally. Editing applied files can create checksum mismatches and make future Flyway runs harder to reason about.

Examples:

- Good: `V4__add_missing_index.sql` corrects a missing index after `V3` was already applied.
- Risky: editing `V3__account_identity_incarnation.sql` after Railway already applied `V3`.

## Private Beta Exception

For private beta only, a full database reset may be acceptable if explicitly chosen and data loss is understood. Before reset:

- Confirm the environment is private beta/shared QA, not public production.
- Confirm whose data will be lost.
- Tell testers that cloud sync data may be lost and local app data should not be cleared unless instructed.
- Record the decision in incident notes.

For production/public users, reset is not acceptable without a user-data recovery/deletion plan.

## Post-Recovery Checklist

Run backend verification locally:

```bash
cd apps/backend
./mvnw verify
```

Then:

- Deploy the corrected backend.
- Check public health:

```bash
curl -i https://www.trainframe.eu/health
curl -i https://www.trainframe.eu/ready
```

- Smoke auth: Google Sign-In on Android and `/me` with a real account if available.
- Confirm invalid JWT handling does not return 5xx:

```bash
curl -i https://www.trainframe.eu/me -H "Authorization: Bearer invalid-token"
```

- Smoke sync from mobile if possible.
- Document the incident in [Production incident runbook](./ops-runbook.md#communication-templates) format.
