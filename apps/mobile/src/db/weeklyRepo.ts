import { query } from './db';
import { WORKOUT_SESSION_STATUS } from './constants';

export type WeeklySummary = {
  week_start: string; // YYYY-MM-DD (UTC-based in SQLite)
  workouts: number;
  total_kg: number;
};

export type WeeklyExerciseRow = {
  exercise_id: string;
  exercise_name: string;
  total_kg: number;
  sets: number;
};

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Uses SQLite's 'now' (UTC). Week starts on Monday (weekday 1).
 * Completed sets only.
 */
export function getThisWeekSummary(): WeeklySummary {
  const row = query<{ week_start: string; workouts: number | null; total_kg: number | null }>(
    `
      SELECT
        date('now','weekday 1','-7 days') AS week_start,
        COUNT(DISTINCT ws.id) AS workouts,
        COALESCE(SUM(wset.weight * wset.reps), 0) AS total_kg
      FROM workout_session ws
      JOIN workout_session_exercise wse
        ON wse.workout_session_id = ws.id
       AND wse.deleted_at IS NULL
      JOIN workout_set wset
        ON wset.workout_session_exercise_id = wse.id
       AND wset.deleted_at IS NULL
      WHERE ws.deleted_at IS NULL
        AND ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND ws.ended_at IS NOT NULL
        AND ws.ended_at >= date('now','weekday 1','-7 days')
        AND wset.is_completed = 1
        AND wset.weight IS NOT NULL
        AND wset.reps IS NOT NULL;
    `,
  )[0] ?? { week_start: '', workouts: 0, total_kg: 0 };

  return {
    week_start: row.week_start,
    workouts: num(row.workouts),
    total_kg: num(row.total_kg),
  };
}

export function listThisWeekExerciseTotals(limit = 8): WeeklyExerciseRow[] {
  return query<WeeklyExerciseRow>(
    `
    SELECT
      wse.exercise_id AS exercise_id,
      wse.exercise_name AS exercise_name,
      COALESCE(SUM(wset.weight * wset.reps), 0) AS total_kg,
      COUNT(*) AS sets
    FROM workout_session ws
    JOIN workout_session_exercise wse
      ON wse.workout_session_id = ws.id
     AND wse.deleted_at IS NULL
    JOIN workout_set wset
      ON wset.workout_session_exercise_id = wse.id
     AND wset.deleted_at IS NULL
    WHERE ws.deleted_at IS NULL
      AND ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
      AND ws.ended_at IS NOT NULL
      AND ws.ended_at >= date('now','weekday 1','-7 days')
      AND wset.is_completed = 1
      AND wset.weight IS NOT NULL
      AND wset.reps IS NOT NULL
    GROUP BY wse.exercise_id, wse.exercise_name
    ORDER BY total_kg DESC
    LIMIT ?;
  `,
    [limit],
  );
}
