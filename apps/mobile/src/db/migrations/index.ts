export type Migration = {
  id: number;
  name: string;
  up: string;
};

import { migration001_init } from './migration001_init';
import { migration002_plans } from './migration002_plans';
import { migration003_workout_sessions } from './003_workout_sessions';

export const migrations: Migration[] = [
  migration001_init,
  migration002_plans,
  migration003_workout_sessions,
];
