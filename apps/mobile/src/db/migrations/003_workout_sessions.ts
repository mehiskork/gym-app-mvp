import type { Migration } from './index';

export const migration003_workout_sessions: Migration = {
  id: 3,
  name: 'workout_sessions',
  up: `
    CREATE TABLE IF NOT EXISTS workout_session (
      id TEXT PRIMARY KEY NOT NULL,
      source_workout_plan_id TEXT,
      source_program_day_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress','completed','discarded')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_workout_session_status_started
      ON workout_session(status, started_at);

    CREATE TABLE IF NOT EXISTS workout_session_exercise (
      id TEXT PRIMARY KEY NOT NULL,
      workout_session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      position INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE(workout_session_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_wse_session_position
      ON workout_session_exercise(workout_session_id, position);

    CREATE TABLE IF NOT EXISTS workout_set (
      id TEXT PRIMARY KEY NOT NULL,
      workout_session_exercise_id TEXT NOT NULL,
      set_index INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      rpe REAL,
      rest_seconds INTEGER,
      notes TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE(workout_session_exercise_id, set_index)
    );

    CREATE INDEX IF NOT EXISTS idx_workout_set_wse_set_index
      ON workout_set(workout_session_exercise_id, set_index);
  `,
};
