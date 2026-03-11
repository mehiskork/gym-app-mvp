import type { Migration } from './index';

export const migration014_wse_source_day_exercise: Migration = {
    id: 14,
    name: 'wse_source_day_exercise',
    up: `
    ALTER TABLE workout_session_exercise
    ADD COLUMN source_program_day_exercise_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_wse_source_program_day_exercise
      ON workout_session_exercise(source_program_day_exercise_id);
  `,
};