import { exec, query } from './db';
import { inTransaction } from './tx';
import { WORKOUT_SESSION_STATUS } from './constants';
import { fetchSessionDetail } from './sessionDetailRepo';

export type CompletedSessionRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  workout_note: string | null;
};

export type RecentSessionSummaryRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  volume: number;
  prs: number;
};

export type SessionExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  notes: string | null;
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
     SELECT id, title, started_at, ended_at, workout_note
    FROM workout_session
    WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}' AND deleted_at IS NULL
    ORDER BY COALESCE(ended_at, started_at) DESC
    LIMIT ?;
  `,
    [limit],
  );
}

export function listRecentSessionSummaries(limit = 3): RecentSessionSummaryRow[] {
  return query<RecentSessionSummaryRow>(
    `
    WITH completed_sessions AS (
     SELECT id, title, started_at, ended_at, workout_note
      FROM workout_session
      WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}' AND deleted_at IS NULL
      ORDER BY COALESCE(ended_at, started_at) DESC
      LIMIT ?
    ),
    session_volume AS (
      SELECT
        cs.id AS session_id,
        COALESCE(SUM(wset.weight * wset.reps), 0) AS volume
      FROM completed_sessions cs
      JOIN workout_session_exercise wse ON wse.workout_session_id = cs.id AND wse.deleted_at IS NULL
      JOIN workout_set wset ON wset.workout_session_exercise_id = wse.id
      WHERE wset.deleted_at IS NULL
        AND wset.is_completed = 1
        AND wset.weight IS NOT NULL
        AND wset.reps IS NOT NULL
      GROUP BY cs.id
    ),
    session_prs AS (
      SELECT session_id, COUNT(*) AS prs
      FROM pr_event
      WHERE deleted_at IS NULL
      GROUP BY session_id
    )
    SELECT
      cs.id AS id,
      cs.title AS title,
      cs.started_at AS started_at,
      cs.ended_at AS ended_at,
      COALESCE(sv.volume, 0) AS volume,
      COALESCE(sp.prs, 0) AS prs
    FROM completed_sessions cs
    LEFT JOIN session_volume sv ON sv.session_id = cs.id
    LEFT JOIN session_prs sp ON sp.session_id = cs.id
    ORDER BY COALESCE(cs.ended_at, cs.started_at) DESC
    LIMIT ?;
  `,
    [limit, limit],
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
          WHERE ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
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
          WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}' AND deleted_at IS NULL
        );
    `);

    // delete completed sessions
    exec(`
      UPDATE workout_session
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}' AND deleted_at IS NULL;
    `);
  });
}

export function getSessionDetail(sessionId: string): {
  session: CompletedSessionRow;
  exercises: SessionExerciseRow[];
  sets: SessionSetRow[];
} | null {
  const detail = fetchSessionDetail(sessionId);
  if (!detail) return null;

  const session: CompletedSessionRow = {
    id: detail.session.id,
    title: detail.session.title,
    started_at: detail.session.started_at,
    ended_at: detail.session.ended_at,
    workout_note: detail.session.workout_note,
  };

  const performedExercises = detail.exercises.filter((exercise) => exercise.sets.length > 0);

  const exercises: SessionExerciseRow[] = performedExercises.map((exercise) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    exercise_name: exercise.exercise_name,
    position: exercise.position,
    notes: exercise.notes,
  }));


  const sets: SessionSetRow[] = performedExercises.flatMap((exercise) => exercise.sets);

  return { session, exercises, sets };
}
