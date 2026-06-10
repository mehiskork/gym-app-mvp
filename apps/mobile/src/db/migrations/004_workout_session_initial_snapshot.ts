import type { Migration } from './index';

export const migration004_workout_session_initial_snapshot: Migration = {
  id: 4,
  name: 'workout_session_initial_snapshot',
  up: `
    CREATE TABLE IF NOT EXISTS workout_session_initial_snapshot (
      workout_session_id TEXT PRIMARY KEY NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};
