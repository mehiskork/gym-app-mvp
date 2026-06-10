import { WORKOUT_SESSION_STATUS } from './constants';
import { query } from './db';
import type { ExerciseType } from './exerciseTypes';

export type WorkoutHistoryExportRow = {
  workout_date: string;
  workout_started_at: string;
  workout_ended_at: string | null;
  workout_name: string;
  workout_source: 'planned_workout' | 'quick_workout';
  exercise_name: string;
  exercise_id: string;
  exercise_type: ExerciseType;
  exercise_order: number;
  set_index: number | null;
  is_completed: number | null;
  reps: number | null;
  weight: number | null;
  duration_minutes: number | null;
  distance_km: number | null;
  speed_kph: number | null;
  incline_percent: number | null;
  resistance_level: number | null;
  pace_seconds_per_km: number | null;
  floors: number | null;
  stair_level: number | null;
  workout_note: string | null;
  exercise_note: string | null;
};

type WorkoutHistoryExportQueryRow = WorkoutHistoryExportRow & {
  sort_workout_at: string;
  row_kind: number;
};

export function listWorkoutHistoryExportRows(): WorkoutHistoryExportRow[] {
  return query<WorkoutHistoryExportQueryRow>(
    `
    SELECT
      workout_date,
      workout_started_at,
      workout_ended_at,
      workout_name,
      workout_source,
      exercise_name,
      exercise_id,
      exercise_type,
      exercise_order,
      set_index,
      is_completed,
      reps,
      weight,
      duration_minutes,
      distance_km,
      speed_kph,
      incline_percent,
      resistance_level,
      pace_seconds_per_km,
      floors,
      stair_level,
      workout_note,
      exercise_note
    FROM (
      SELECT
        substr(COALESCE(ws.ended_at, ws.started_at), 1, 10) AS workout_date,
        ws.started_at AS workout_started_at,
        ws.ended_at AS workout_ended_at,
        ws.title AS workout_name,
        CASE
          WHEN ws.source_workout_plan_id IS NOT NULL OR ws.source_program_day_id IS NOT NULL
            THEN 'planned_workout'
          ELSE 'quick_workout'
        END AS workout_source,
        wse.exercise_name AS exercise_name,
        wse.exercise_id AS exercise_id,
        wse.exercise_type AS exercise_type,
        wse.position AS exercise_order,
        wset.set_index AS set_index,
        wset.is_completed AS is_completed,
        wset.reps AS reps,
        wset.weight AS weight,
        NULL AS duration_minutes,
        NULL AS distance_km,
        NULL AS speed_kph,
        NULL AS incline_percent,
        NULL AS resistance_level,
        NULL AS pace_seconds_per_km,
        NULL AS floors,
        NULL AS stair_level,
        ws.workout_note AS workout_note,
        wse.notes AS exercise_note,
        COALESCE(ws.ended_at, ws.started_at) AS sort_workout_at,
        0 AS row_kind
      FROM workout_session ws
      JOIN workout_session_exercise wse
        ON wse.workout_session_id = ws.id
      JOIN workout_set wset
        ON wset.workout_session_exercise_id = wse.id
      WHERE ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND ws.deleted_at IS NULL
        AND wse.deleted_at IS NULL
        AND wse.exercise_type = 'strength'
        AND wset.deleted_at IS NULL
        AND wset.is_completed = 1

      UNION ALL

      SELECT
        substr(COALESCE(ws.ended_at, ws.started_at), 1, 10) AS workout_date,
        ws.started_at AS workout_started_at,
        ws.ended_at AS workout_ended_at,
        ws.title AS workout_name,
        CASE
          WHEN ws.source_workout_plan_id IS NOT NULL OR ws.source_program_day_id IS NOT NULL
            THEN 'planned_workout'
          ELSE 'quick_workout'
        END AS workout_source,
        wse.exercise_name AS exercise_name,
        wse.exercise_id AS exercise_id,
        wse.exercise_type AS exercise_type,
        wse.position AS exercise_order,
        NULL AS set_index,
        NULL AS is_completed,
        NULL AS reps,
        NULL AS weight,
        wse.cardio_duration_minutes AS duration_minutes,
        wse.cardio_distance_km AS distance_km,
        wse.cardio_speed_kph AS speed_kph,
        wse.cardio_incline_percent AS incline_percent,
        wse.cardio_resistance_level AS resistance_level,
        wse.cardio_pace_seconds_per_km AS pace_seconds_per_km,
        wse.cardio_floors AS floors,
        wse.cardio_stair_level AS stair_level,
        ws.workout_note AS workout_note,
        wse.notes AS exercise_note,
        COALESCE(ws.ended_at, ws.started_at) AS sort_workout_at,
        1 AS row_kind
      FROM workout_session ws
      JOIN workout_session_exercise wse
        ON wse.workout_session_id = ws.id
      WHERE ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND ws.deleted_at IS NULL
        AND wse.deleted_at IS NULL
        AND wse.exercise_type = 'cardio'
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
    ORDER BY
      sort_workout_at ASC,
      workout_started_at ASC,
      exercise_order ASC,
      row_kind ASC,
      set_index ASC;
  `,
  );
}
