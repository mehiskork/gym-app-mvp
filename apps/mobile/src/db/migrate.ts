import { exec, query } from './db';
import { migrations } from './migrations';

type Row = { id: number };

export function runMigrations() {
  // Ensure migrations table exists (in case first migration fails early)
  exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set<number>(query<Row>('SELECT id FROM schema_migrations').map((r) => r.id));

  for (const m of migrations) {
    if (applied.has(m.id)) continue;

    // Apply migration SQL
    exec(m.up);

    // Record as applied
    exec('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name]);
  }
}
