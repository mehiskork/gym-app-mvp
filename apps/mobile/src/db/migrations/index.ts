import { migration001_private_beta_baseline } from './001_private_beta_baseline';
import { migration002_workout_exercise_plan_note_snapshot } from './002_workout_exercise_plan_note_snapshot';
import { migration003_program_day_exercise_planned_cardio_targets } from './003_program_day_exercise_planned_cardio_targets';
import { migration004_workout_session_initial_snapshot } from './004_workout_session_initial_snapshot';

export type Migration = {
  id: number;
  name: string;
  up: string;
};

export const migrations: Migration[] = [
  migration001_private_beta_baseline,
  migration002_workout_exercise_plan_note_snapshot,
  migration003_program_day_exercise_planned_cardio_targets,
  migration004_workout_session_initial_snapshot,
];
