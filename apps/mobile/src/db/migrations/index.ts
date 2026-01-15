import { migration001_init } from './migration001_init';
import { migration002_plans } from './migration002_plans';
import { migration003_workout_sessions } from './003_workout_sessions';
import { migration004_rest_timer } from './004_rest_timer';
import { migration005_single_in_progress_session } from './005_single_in_progress_session';

export type Migration = {
  id: number;
  name: string;
  up: string;
};

export const migrations: Migration[] = [
  migration001_init,
  migration002_plans,
  migration003_workout_sessions,
  migration004_rest_timer,
  migration005_single_in_progress_session,
];
