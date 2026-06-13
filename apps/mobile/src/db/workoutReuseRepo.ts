import { query } from './db';
import { WORKOUT_SESSION_STATUS } from './constants';
import { EXERCISE_TYPE, type CardioProfile, type ExerciseType } from './exerciseTypes';

export const NO_REUSABLE_WORKOUT_CONTENT_MESSAGE = 'No completed sets or cardio details to reuse.';

export type ReusableSourceSessionRow = {
  id: string;
  title: string;
};

export type ReusableWorkoutExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  cardio_profile: CardioProfile | null;
  position: number;
  cardio_duration_minutes: number | null;
  cardio_distance_km: number | null;
  cardio_speed_kph: number | null;
  cardio_incline_percent: number | null;
  cardio_resistance_level: number | null;
  cardio_pace_seconds_per_km: number | null;
  cardio_floors: number | null;
  cardio_stair_level: number | null;
};

export type ReusableWorkoutSetRow = {
  workout_session_exercise_id: string;
  weight: number | null;
  reps: number | null;
  rest_seconds: number | null;
  set_index: number;
};

export function getReusableSourceSession(sessionId: string): ReusableSourceSessionRow {
  const source = query<ReusableSourceSessionRow>(
    `
    SELECT id, title
    FROM workout_session
    WHERE id = ?
      AND status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
      AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId],
  )[0];

  if (!source) {
    throw new Error(NO_REUSABLE_WORKOUT_CONTENT_MESSAGE);
  }

  return source;
}

export function listReusableWorkoutExercises(sessionId: string): ReusableWorkoutExerciseRow[] {
  return query<ReusableWorkoutExerciseRow>(
    `
    SELECT
      wse.id,
      wse.exercise_id,
      wse.exercise_name,
      wse.exercise_type,
      wse.cardio_profile,
      wse.position,
      wse.cardio_duration_minutes,
      wse.cardio_distance_km,
      wse.cardio_speed_kph,
      wse.cardio_incline_percent,
      wse.cardio_resistance_level,
      wse.cardio_pace_seconds_per_km,
      wse.cardio_floors,
      wse.cardio_stair_level
    FROM workout_session_exercise wse
    JOIN workout_session session ON session.id = wse.workout_session_id
    JOIN exercise e ON e.id = wse.exercise_id
    WHERE wse.workout_session_id = ?
      AND session.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
      AND session.deleted_at IS NULL
      AND wse.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND (
        (
          wse.exercise_type = '${EXERCISE_TYPE.STRENGTH}'
          AND EXISTS (
            SELECT 1
            FROM workout_set ws
            WHERE ws.workout_session_exercise_id = wse.id
              AND ws.deleted_at IS NULL
              AND ws.is_completed = 1
              AND (COALESCE(ws.reps, 0) > 0 OR COALESCE(ws.weight, 0) > 0)
          )
        )
        OR (
          wse.exercise_type = '${EXERCISE_TYPE.CARDIO}'
          AND (
            wse.cardio_duration_minutes IS NOT NULL OR
            wse.cardio_distance_km IS NOT NULL OR
            wse.cardio_speed_kph IS NOT NULL OR
            wse.cardio_incline_percent IS NOT NULL OR
            wse.cardio_resistance_level IS NOT NULL OR
            wse.cardio_pace_seconds_per_km IS NOT NULL OR
            wse.cardio_floors IS NOT NULL OR
            wse.cardio_stair_level IS NOT NULL
          )
        )
      )
    ORDER BY wse.position ASC;
  `,
    [sessionId],
  );
}

export function listReusableWorkoutSets(sessionExerciseId: string): ReusableWorkoutSetRow[] {
  return query<ReusableWorkoutSetRow>(
    `
    SELECT
      workout_session_exercise_id,
      weight,
      reps,
      rest_seconds,
      set_index
    FROM workout_set
    WHERE workout_session_exercise_id = ?
      AND deleted_at IS NULL
      AND is_completed = 1
      AND (COALESCE(reps, 0) > 0 OR COALESCE(weight, 0) > 0)
    ORDER BY set_index ASC;
  `,
    [sessionExerciseId],
  );
}

export function hasReusableWorkoutContent(sessionId: string): boolean {
  return listReusableWorkoutExercises(sessionId).length > 0;
}

export function validateReusableWorkoutSource(sessionId: string): ReusableSourceSessionRow {
  const source = getReusableSourceSession(sessionId);
  if (!hasReusableWorkoutContent(sessionId)) {
    throw new Error(NO_REUSABLE_WORKOUT_CONTENT_MESSAGE);
  }
  return source;
}
