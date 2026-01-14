import type { Migration } from './index';

export const migration001_init: Migration = {
  id: 1,
  name: 'init schema_migrations + exercise',
  up: `
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exercise (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      owner_user_id TEXT NULL,

      equipment TEXT NULL,
      primary_muscle TEXT NULL,
      notes TEXT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_name ON exercise(name);
    CREATE INDEX IF NOT EXISTS idx_exercise_normalized_name ON exercise(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_exercise_deleted_at ON exercise(deleted_at);
  `,
};
