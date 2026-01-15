import type { Migration } from './index';

export const migration006_rest_timer_countup: Migration = {
  id: 6,
  name: 'rest timer count-up (started_at + target_seconds)',
  up: `
    ALTER TABLE workout_session ADD COLUMN rest_timer_started_at TEXT NULL;
    ALTER TABLE workout_session ADD COLUMN rest_timer_target_seconds INTEGER NULL;
  `,
};
