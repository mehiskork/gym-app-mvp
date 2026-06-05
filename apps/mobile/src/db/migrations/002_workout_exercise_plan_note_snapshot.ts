import type { Migration } from './index';

export const migration002_workout_exercise_plan_note_snapshot: Migration = {
  id: 2,
  name: 'workout exercise plan note snapshot',
  up: `
    ALTER TABLE workout_session_exercise
      ADD COLUMN plan_note_snapshot TEXT NULL;
  `,
};
