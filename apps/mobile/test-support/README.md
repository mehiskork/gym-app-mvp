# SQLite migration safety fixtures

`historicalMigrations.json` contains the exact exported migration definitions from
commit `50c6e28b0a6cda6a828ce4726e24a69e68d7aabd`, before the atomic-migration change.
Keep this fixture frozen; do not regenerate it from current migration code.
The source commit is recorded in the JSON. No Git history is required to run tests.

`historicalUserData.sql` is synthetic baseline-compatible data, not a production
database dump. Tests add version-specific fields and rows after historical upgrades.

`sqliteMigrationHarness.cjs` transpiles the actual production database wrapper,
transaction helper and migration runner. It substitutes only Expo's native SQLite
bridge with Node's real SQLite implementation. Each harness has a separate module
cache/connection, representing an app restart. It is not bundled into the app.

`crashMigration.cjs` is a child-process worker. It kills itself with SIGKILL after
an ALTER TABLE or migration-marker insert, without executing cleanup. These tests
cover process termination, not storage-device failure or hardware power loss.
