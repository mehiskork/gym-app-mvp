# Mobile SQLite migration safety

This covers the on-device `gym_app.db`, not backend Flyway/Postgres migrations.
It does not change the mobile schema, migration IDs/names, account credentials,
sync protocol, or historical workout data.

## Transaction boundary

Each pending migration and its `schema_migrations` completion record run in one
synchronous transaction. Previously completed migrations are skipped. A failure
stops the runner before later migrations, seeding, cleanup, or startup sync.
Earlier migrations that committed successfully remain committed.

The migration-history table is bootstrapped before these transactions, so a
failed fresh baseline may leave only that empty table. WAL initialization runs
outside the transaction, only when baseline migration 1 is pending. Relocating
that PRAGMA is the sole change to a historical migration definition.

The shared transaction helper restores nesting depth exactly once even if
COMMIT fails. Nested calls still share their caller's transaction; they are not
savepoints. Callbacks must remain synchronous and propagate failures if the
outer transaction must roll back. This change does not alter those semantics.

## Failure and retry policy

- A failed BEGIN does not run the callback or roll back someone else's transaction.
- A callback or COMMIT failure attempts rollback and propagates the failure.
- If ROLLBACK also throws, retain both errors and inspect Expo's transaction state.
  SQLite may already have rolled back automatically. If it reports no active
  transaction, another attempt is allowed.
- If the connection is still in a transaction, or its state cannot be checked,
  block subsequent transaction calls and migration-history reads until app restart.
  Startup shows a restart-only screen without retry or reset actions. Fully close
  and reopen the app; do not uninstall it or clear storage.

The guard protects transaction entry points and the migration runner. It is not
a general replacement for database lifecycle management or a global write lock.
If startup still fails after restart, preserve the local database and investigate.
Do not advise users to reset as a routine migration-recovery procedure: cloud sync
may not contain guest data, unfinished workouts, or pending outbox changes.

## Previously partial migrations

Transactions prevent new partial application; they do not repair old partial
migrations. For example, an existing migration-3 column without its completion
record still raises a duplicate-column error. The new runner rolls back its own
attempt, leaves existing records/columns intact, and does not mark it complete.

Do not suppress duplicate-column errors, guess completion from one column, delete
migration history, or auto-reset the database. Any repair needs a separate plan
based on the exact schema and a consistent backup, including uncheckpointed WAL
data. Do not copy only an open `.db` file and assume it is a complete backup.
Existing user-confirmed account-deletion/reset behavior is unchanged.

## Automated validation

Run mobile typecheck, lint, and the full Jest suite. Migration safety tests use:

- Frozen pre-change migration definitions from commit
  `50c6e28b0a6cda6a828ce4726e24a69e68d7aabd`, independent of current code.
- Synthetic guest/linked records at each completed version 1–5 and fresh databases.
- Real SQLite executing the production DB wrapper, transaction helper and runner;
  only the Expo native bridge is substituted with Node SQLite.
- Exact historical-column value comparisons (including IDs, timestamps, tombstones,
  outbox payloads and attempts, sync metadata, workout notes, targets and snapshots).
- Injected SQL, marker-write, COMMIT, and ROLLBACK failures; same-connection and
  reopen retries; integrity/foreign-key checks; repeated startup and explicit reset.
- File-backed WAL recovery after SIGKILL at a migration-3 column write and after
  the completion-marker write, without executing application cleanup.

Process termination tests are not a simulation of hardware power loss or storage
failure. Node SQLite coverage does not replace Expo-native Android testing.

## Release gate (manual, before production rollout)

1. Install the previously released Android build on a test device. Create guest
   history, an unfinished workout, and unsynced edits while offline. Repeat for a
   linked account, keeping some edits unsynced. Use synthetic test data.
2. Upgrade in place to the candidate build with matching application ID/signature
   and higher version code. Do not uninstall or clear storage.
3. Verify history, sets, notes, saved plans, favorites, and unfinished workout state.
   Reopen the app multiple times, then reconnect and verify sync without loss or
   duplication. For older supported schemas, use an appropriate older test build
   or controlled emulator fixture rather than modifying a real user's database.
4. Check normal explicit account-deletion/reset flows on disposable test accounts.
5. Release gradually and watch startup failures. Halt rollout if failures increase.

No new schema version is introduced. Prefer a corrective app release if a runner
regression occurs; never use a database reset as the rollback strategy. Reverting
the safeguard restores the old partial-migration risk and needs deliberate review.

References: [SQLite transaction errors](https://www.sqlite.org/lang_transaction.html),
[Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).
