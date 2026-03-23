import type { Migration } from './index';

export const migration015_workout_session_note: Migration = {
    id: 15,
    name: 'workout_session_note',
    up: `
    ALTER TABLE workout_session ADD COLUMN workout_note TEXT;
  `,
};