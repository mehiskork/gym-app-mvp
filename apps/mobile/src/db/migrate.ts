import { exec, query } from './db';
import { migrations } from './migrations';
import { assertTransactionConnectionReady, inTransaction } from './tx';

type Row = { id: number };

export function runMigrations() {
  // A failed rollback may leave uncommitted completion markers visible on this
  // connection. Do not inspect them or mutate the schema until the app restarts.
  assertTransactionConnectionReady();
  // Ensure migrations table exists (in case first migration fails early)
  exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(query<Row>('SELECT id FROM schema_migrations').map((r) => r.id));

  // Journal mode cannot be changed inside the baseline transaction. Preserve
  // the old behavior: initialize WAL only when migration 1 is still pending.
  if (!applied.has(1)) exec('PRAGMA journal_mode = WAL');

  for (const m of migrations) {
    if (applied.has(m.id)) continue;

    inTransaction(() => {
      exec(m.up);
      exec('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name]);
    });
  }
}
