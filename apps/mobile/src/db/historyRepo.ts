import { exec, inTransaction, query } from './db'; // ensure exec + inTransaction are imported

export type CompletedSessionRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
};

export type SessionExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
};

export type SessionSetRow = {
  id: string;
  workout_session_exercise_id: string;
  set_index: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
  is_completed: number; // 0/1
};

export function listCompletedSessions(limit = 50): CompletedSessionRow[] {
  return query<CompletedSessionRow>(
    `
    SELECT id, title, started_at, ended_at
    FROM workout_session
    WHERE status = 'completed' AND deleted_at IS NULL
    ORDER BY COALESCE(ended_at, started_at) DESC
    LIMIT ?;
  `,
    [limit],
  );
}

export function deleteSession(sessionId: string): void {
  inTransaction(() => {
    // delete sets first
    exec(
      `
      UPDATE workout_set
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE deleted_at IS NULL
        AND workout_session_exercise_id IN (
          SELECT id FROM workout_session_exercise
          WHERE workout_session_id = ?
        );
    `,
      [sessionId],
    );

    // delete session exercises
    exec(
      `
      UPDATE workout_session_exercise
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE workout_session_id = ?
        AND deleted_at IS NULL;
    `,
      [sessionId],
    );

    // delete session
    exec(
      `
      UPDATE workout_session
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
        AND deleted_at IS NULL;
    `,
      [sessionId],
    );
  });
}

export function deleteAllCompletedSessions(): void {
  inTransaction(() => {
    // delete sets for completed sessions
    exec(`
      UPDATE workout_set
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE deleted_at IS NULL
        AND workout_session_exercise_id IN (
          SELECT wse.id
          FROM workout_session_exercise wse
          JOIN workout_session ws ON ws.id = wse.workout_session_id
          WHERE ws.status = 'completed'
            AND ws.deleted_at IS NULL
            AND wse.deleted_at IS NULL
        );
    `);

    // delete session exercises for completed sessions
    exec(`
      UPDATE workout_session_exercise
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE deleted_at IS NULL
        AND workout_session_id IN (
          SELECT id FROM workout_session
          WHERE status = 'completed' AND deleted_at IS NULL
        );
    `);

    // delete completed sessions
    exec(`
      UPDATE workout_session
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE status = 'completed' AND deleted_at IS NULL;
    `);
  });
}

export function getSessionDetail(sessionId: string): {
  session: CompletedSessionRow;
  exercises: SessionExerciseRow[];
  sets: SessionSetRow[];
} | null {
  const session = query<CompletedSessionRow>(
    `
    SELECT id, title, started_at, ended_at
    FROM workout_session
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId],
  )[0];

  if (!session) return null;

  const exercises = query<SessionExerciseRow>(
    `
    SELECT id, exercise_id, exercise_name, position
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND deleted_at IS NULL
    ORDER BY position ASC;
  `,
    [sessionId],
  );

  const sets = query<SessionSetRow>(
    `
    SELECT
      id,
      workout_session_exercise_id,
      set_index,
      weight,
      reps,
      rpe,
      rest_seconds,
      notes,
      is_completed
    FROM workout_set
    WHERE workout_session_exercise_id IN (
      SELECT id FROM workout_session_exercise
      WHERE workout_session_id = ? AND deleted_at IS NULL
    )
      AND deleted_at IS NULL
    ORDER BY workout_session_exercise_id ASC, set_index ASC;
  `,
    [sessionId],
  );

  return { session, exercises, sets };
}
