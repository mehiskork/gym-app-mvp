import { query } from './db';
import { WORKOUT_SESSION_STATUS } from './constants';
import { weekStartExpression } from './dateSql';

export type WeeklyVolumeRow = {
  week_start: string; // YYYY-MM-DD
  sessions: number;
  volume: number; // sum(weight*reps)
};

export function listWeeklyVolume(weeksBack = 8): WeeklyVolumeRow[] {
  // SQLite: compute Monday week start in UTC-like date space.
  // %w: 0=Sun..6=Sat. This converts to Monday-based weeks.
  const weekStartExpr = weekStartExpression('cs.started_at');
  return query<WeeklyVolumeRow>(
    `
    WITH completed_sessions AS (
      SELECT id, started_at
      FROM workout_session
       WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND deleted_at IS NULL
    ),
    session_volume AS (
      SELECT
        cs.id AS session_id,
        ${weekStartExpr} AS week_start,
        SUM(ws.weight * ws.reps) AS volume
      FROM completed_sessions cs
      JOIN workout_session_exercise wse ON wse.workout_session_id = cs.id AND wse.deleted_at IS NULL
      JOIN workout_set ws ON ws.workout_session_exercise_id = wse.id
      WHERE ws.deleted_at IS NULL
        AND ws.is_completed = 1
        AND ws.weight IS NOT NULL
        AND ws.reps IS NOT NULL
      GROUP BY cs.id
    )
    SELECT
      week_start,
      COUNT(*) AS sessions,
      COALESCE(SUM(volume), 0) AS volume
    FROM session_volume
    GROUP BY week_start
    ORDER BY week_start DESC
    LIMIT ?;
  `,
    [weeksBack],
  );
}
