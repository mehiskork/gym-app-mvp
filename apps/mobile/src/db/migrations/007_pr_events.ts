import type { Migration } from './index';

export const migration007_pr_events: Migration = {
  id: 7,
  name: 'add pr_event',
  up: `
    CREATE TABLE IF NOT EXISTS pr_event (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      pr_type TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      FOREIGN KEY (session_id) REFERENCES workout_session(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercise(id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pr_event_unique
      ON pr_event(session_id, exercise_id, pr_type, context);

    CREATE INDEX IF NOT EXISTS idx_pr_event_session ON pr_event(session_id);
    CREATE INDEX IF NOT EXISTS idx_pr_event_exercise ON pr_event(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_pr_event_deleted_at ON pr_event(deleted_at);
  `,
};
