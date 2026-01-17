import { exec, query } from './db';
import { inTransaction } from './tx';

export type TableCounts = Record<string, number>;

export function getTableCounts(): TableCounts {
  const tables = [
    'program',
    'program_week',
    'program_day',
    'program_day_exercise',
    'planned_set',
    'exercise',
    'workout_session',
    'workout_session_exercise',
    'workout_set',
    'pr_event',
    'app_log',
  ];

  const counts: TableCounts = {};
  for (const t of tables) {
    try {
      const row = query<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`)[0];
      counts[t] = row?.c ?? 0;
    } catch {
      counts[t] = -1;
    }
  }
  return counts;
}

export type InProgressWorkout = {
  sessionId: string;
  startedAt: number | null;
  setCount: number;
} | null;

export function getInProgressWorkout(): InProgressWorkout {
  const session = query<{ id: string; started_at: string }>(
    `
    SELECT id, started_at
    FROM workout_session
    WHERE status = 'in_progress' AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  `,
  )[0];

  if (!session) return null;

  const setRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM workout_set ws
    JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
    WHERE wse.workout_session_id = ?;
  `,
    [session.id],
  )[0];

  return {
    sessionId: session.id,
    startedAt: session.started_at ? Date.parse(session.started_at) : null,
    setCount: setRow?.c ?? 0,
  };
}

export function resetInProgressWorkoutHardDelete(): void {
  inTransaction(() => {
    const session = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session
      WHERE status = 'in_progress' AND deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1;
    `,
    )[0];

    if (!session) return;

    exec(
      `
      DELETE FROM workout_set
      WHERE workout_session_exercise_id IN (
        SELECT id FROM workout_session_exercise WHERE workout_session_id = ?
      );
    `,
      [session.id],
    );
    exec(`DELETE FROM workout_session_exercise WHERE workout_session_id = ?`, [session.id]);
    exec(`DELETE FROM workout_session WHERE id = ?`, [session.id]);
  });
}
