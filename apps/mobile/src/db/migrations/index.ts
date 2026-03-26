import { migration001_init } from './migration001_init';
import { migration002_plans } from './migration002_plans';
import { migration003_workout_sessions } from './003_workout_sessions';
import { migration004_rest_timer } from './004_rest_timer';
import { migration005_single_in_progress_session } from './005_single_in_progress_session';
import { migration006_rest_timer_countup } from './006_rest_timer_countup';
import { migration007_pr_events } from './007_pr_events';
import { migration008_app_meta } from './migration008_app_meta';
import { migration009_app_log } from './009_app_log';
import { migration010_sync_foundations } from './010_sync_foundations';
import { migration011_outbox_inflight } from './011_outbox_inflight';
import { migration012_sync_state_delta_count } from './012_sync_state_delta_count';
import { migration013_sync_run } from './013_sync_run';
import { migration014_wse_source_day_exercise } from './014_wse_source_day_exercise';
import { migration015_workout_session_note } from './015_workout_session_note';
import { migration016_cardio_exercises } from './016_cardio_exercises';

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
  migration006_rest_timer_countup,
  migration007_pr_events,
  migration008_app_meta,
  migration009_app_log,
  migration010_sync_foundations,
  migration011_outbox_inflight,
  migration012_sync_state_delta_count,
  migration013_sync_run,
  migration014_wse_source_day_exercise,
  migration015_workout_session_note,
  migration016_cardio_exercises,
];
