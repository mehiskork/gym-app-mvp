import type { Migration } from './index';

export const migration001_private_beta_baseline: Migration = {
  id: 1,
  name: 'private beta baseline',
  up: `
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

      exercise_type TEXT NOT NULL DEFAULT 'strength'
        CHECK (exercise_type IN ('strength', 'cardio')),
      cardio_profile TEXT
        CHECK (cardio_profile IN ('treadmill', 'bike', 'ergometer', 'stairs', 'elliptical')),

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,

      version INTEGER NOT NULL DEFAULT 0,
      last_modified_by_device_id TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_name ON exercise(name);
    CREATE INDEX IF NOT EXISTS idx_exercise_normalized_name ON exercise(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_exercise_deleted_at ON exercise(deleted_at);

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

    CREATE TABLE IF NOT EXISTS workout_session (
      id TEXT PRIMARY KEY NOT NULL,
      source_workout_plan_id TEXT,
      source_program_day_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('in_progress','completed','discarded')),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      workout_note TEXT,
      rest_timer_end_at TEXT,
      rest_timer_seconds INTEGER,
      rest_timer_label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_workout_session_status_started
      ON workout_session(status, started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_session_single_in_progress
      ON workout_session(status)
      WHERE status = 'in_progress' AND deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS workout_session_exercise (
      id TEXT PRIMARY KEY NOT NULL,
      workout_session_id TEXT NOT NULL,
      source_program_day_exercise_id TEXT,
      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      exercise_type TEXT NOT NULL DEFAULT 'strength'
        CHECK (exercise_type IN ('strength', 'cardio')),
      cardio_profile TEXT
        CHECK (cardio_profile IN ('treadmill', 'bike', 'ergometer', 'stairs', 'elliptical')),
      position INTEGER NOT NULL,
      notes TEXT,
      cardio_duration_minutes INTEGER,
      cardio_distance_km REAL,
      cardio_speed_kph REAL,
      cardio_incline_percent REAL,
      cardio_resistance_level REAL,
      cardio_pace_seconds_per_km REAL,
      cardio_floors INTEGER,
      cardio_stair_level REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE(workout_session_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_wse_session_position
      ON workout_session_exercise(workout_session_id, position);
    CREATE INDEX IF NOT EXISTS idx_wse_source_program_day_exercise
      ON workout_session_exercise(source_program_day_exercise_id);

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

    -- Local-derived cache. PR events are rebuilt from synced workout history and are not /sync entities.
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

    -- Local-only metadata: device identity, linked account state, debug state, and support diagnostics.
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_log (
      id INTEGER PRIMARY KEY NOT NULL,
      at INTEGER NOT NULL,
      level TEXT NOT NULL,
      tag TEXT NOT NULL,
      message TEXT NOT NULL,
      context_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_app_log_at ON app_log(at);

    CREATE TABLE IF NOT EXISTS outbox_op (
      id TEXT PRIMARY KEY NOT NULL,
      op_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_op_op_id ON outbox_op(op_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_op_status_created ON outbox_op(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_op_entity ON outbox_op(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_op_status_next_attempt
      ON outbox_op(status, next_attempt_at);

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      cursor TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      backoff_until TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_delta_count INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sync_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS sync_run (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      cursor_before TEXT NULL,
      cursor_after TEXT NULL,
      ops_sent INTEGER NOT NULL DEFAULT 0,
      acks_applied INTEGER NOT NULL DEFAULT 0,
      acks_noop INTEGER NOT NULL DEFAULT 0,
      acks_rejected INTEGER NOT NULL DEFAULT 0,
      deltas_received INTEGER NOT NULL DEFAULT 0,
      deltas_applied INTEGER NOT NULL DEFAULT 0,
      http_status INTEGER NULL,
      error_code TEXT NULL,
      error_message TEXT NULL,
      backoff_seconds INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS sync_run_started_at_idx
      ON sync_run (started_at DESC);
    CREATE INDEX IF NOT EXISTS sync_run_status_started_at_idx
      ON sync_run (status, started_at DESC);
  `,
};
