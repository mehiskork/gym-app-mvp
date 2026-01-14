import type { Migration } from './index';

export const migration002_plans: Migration = {
  id: 2,
  name: 'add program/week/day/day_exercise/planned_set',
  up: `
    CREATE TABLE IF NOT EXISTS program (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NULL,

      is_template INTEGER NOT NULL DEFAULT 0,
      owner_user_id TEXT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_program_deleted_at ON program(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_program_owner ON program(owner_user_id);

    CREATE TABLE IF NOT EXISTS program_week (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      week_index INTEGER NOT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL,

      FOREIGN KEY (program_id) REFERENCES program(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_program_week_program_weekindex
      ON program_week(program_id, week_index);
    CREATE INDEX IF NOT EXISTS idx_program_week_program ON program_week(program_id);
    CREATE INDEX IF NOT EXISTS idx_program_week_deleted_at ON program_week(deleted_at);

    CREATE TABLE IF NOT EXISTS program_day (
      id TEXT PRIMARY KEY,
      program_week_id TEXT NOT NULL,
      day_index INTEGER NOT NULL,
      name TEXT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL,

      FOREIGN KEY (program_week_id) REFERENCES program_week(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_program_day_week_dayindex
      ON program_day(program_week_id, day_index);
    CREATE INDEX IF NOT EXISTS idx_program_day_week ON program_day(program_week_id);
    CREATE INDEX IF NOT EXISTS idx_program_day_deleted_at ON program_day(deleted_at);

    CREATE TABLE IF NOT EXISTS program_day_exercise (
      id TEXT PRIMARY KEY,
      program_day_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      notes TEXT NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL,

      FOREIGN KEY (program_day_id) REFERENCES program_day(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercise(id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_day_exercise_day_position
      ON program_day_exercise(program_day_id, position);
    CREATE INDEX IF NOT EXISTS idx_day_exercise_day ON program_day_exercise(program_day_id);
    CREATE INDEX IF NOT EXISTS idx_day_exercise_exercise ON program_day_exercise(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_day_exercise_deleted_at ON program_day_exercise(deleted_at);

    CREATE TABLE IF NOT EXISTS planned_set (
      id TEXT PRIMARY KEY,
      program_day_exercise_id TEXT NOT NULL,
      set_index INTEGER NOT NULL,

      target_reps_min INTEGER NULL,
      target_reps_max INTEGER NULL,
      target_rpe REAL NULL,
      target_weight REAL NULL,
      rest_seconds INTEGER NULL,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL,

      FOREIGN KEY (program_day_exercise_id) REFERENCES program_day_exercise(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_planned_set_exercise_setindex
      ON planned_set(program_day_exercise_id, set_index);
    CREATE INDEX IF NOT EXISTS idx_planned_set_exercise ON planned_set(program_day_exercise_id);
    CREATE INDEX IF NOT EXISTS idx_planned_set_deleted_at ON planned_set(deleted_at);
  `,
};
