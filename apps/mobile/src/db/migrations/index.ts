import { migration001_private_beta_baseline } from './001_private_beta_baseline';
import { migration002_workout_exercise_plan_note_snapshot } from './002_workout_exercise_plan_note_snapshot';

export type Migration = {
  id: number;
  name: string;
  up: string;
};

export const migrations: Migration[] = [
  migration001_private_beta_baseline,
  migration002_workout_exercise_plan_note_snapshot,
];
