import { exec, query } from './db';
import { migrations } from './migrations';

type Row = { id: number };
type ColumnRow = { name: string };

function hasLegacyCardioDurationSchemaDrift(): boolean {
  const columns = query<ColumnRow>(`PRAGMA table_info(workout_session_exercise);`).map(
    (row) => row.name,
  );
  return columns.includes('cardio_duration_seconds') && !columns.includes('cardio_duration_minutes');
}

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

    if (m.id === 16 && hasLegacyCardioDurationSchemaDrift()) {
      throw new Error(
        'Cannot apply migration 16: detected legacy workout_session_exercise schema drift ' +
        '(cardio_duration_seconds present while cardio_duration_minutes is missing). ' +
        'Please reset local app DB and re-sync before retrying.',
      );
    }

    // Apply migration SQL
    exec(m.up);

    // Record as applied
    exec('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [m.id, m.name]);
  }
}
