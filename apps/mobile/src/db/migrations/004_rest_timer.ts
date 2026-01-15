import type { Migration } from './index';

export const migration004_rest_timer: Migration = {
  id: 4,
  name: 'workout_session_rest_timer',
  up: `
    ALTER TABLE workout_session ADD COLUMN rest_timer_end_at TEXT;
    ALTER TABLE workout_session ADD COLUMN rest_timer_seconds INTEGER;
    ALTER TABLE workout_session ADD COLUMN rest_timer_label TEXT;
  `,
};
