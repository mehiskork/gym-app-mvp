import type { Migration } from './index';

export const migration005_exercise_favorites: Migration = {
  id: 5,
  name: 'exercise favorites',
  up: `
    CREATE TABLE IF NOT EXISTS exercise_favorite (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL,

      UNIQUE(exercise_id)
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_favorite_exercise_id
      ON exercise_favorite(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_exercise_favorite_deleted_at
      ON exercise_favorite(deleted_at);
  `,
};
