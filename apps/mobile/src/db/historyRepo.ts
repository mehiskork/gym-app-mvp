import { exec, query } from './db';
import { inTransaction } from './tx';
import { WORKOUT_SESSION_STATUS } from './constants';
import { fetchSessionDetail } from './sessionDetailRepo';
import { enqueueOutboxOp } from './outboxRepo';
import type { CardioProfile, ExerciseType } from './exerciseTypes';

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
  exercise_type: ExerciseType;
  cardio_profile: CardioProfile | null;
  position: number;
  notes: string | null;
  cardio_duration_minutes: number | null;
  cardio_distance_km: number | null;
  cardio_speed_kph: number | null;
  cardio_incline_percent: number | null;
  cardio_resistance_level: number | null;
  cardio_pace_seconds_per_km: number | null;
  cardio_floors: number | null;
  cardio_stair_level: number | null;
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

function enqueueEntitySnapshot(
  entityType: 'workout_session' | 'workout_session_exercise' | 'workout_set',
  id: string,
) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM ${entityType}
    WHERE id = ?
    LIMIT 1;
  `,
    [id],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType,
    entityId: id,
    opType: 'delete',
    payloadJson: JSON.stringify(row),
  });
}

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
    const setIds = query<{ id: string }>(
      `
      SELECT ws.id AS id
      FROM workout_set ws
      JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
      WHERE wse.workout_session_id = ?
        AND ws.deleted_at IS NULL
        AND wse.deleted_at IS NULL;
    `,
      [sessionId],
    ).map((row) => row.id);

    const sessionExerciseIds = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session_exercise
      WHERE workout_session_id = ?
        AND deleted_at IS NULL;
    `,
      [sessionId],
    ).map((row) => row.id);

    const sessionIds = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session
      WHERE id = ?
        AND deleted_at IS NULL;
    `,
      [sessionId],
    ).map((row) => row.id);
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

    for (const setId of setIds) {
      enqueueEntitySnapshot('workout_set', setId);
    }
    for (const sessionExerciseId of sessionExerciseIds) {
      enqueueEntitySnapshot('workout_session_exercise', sessionExerciseId);
    }
    for (const id of sessionIds) {
      enqueueEntitySnapshot('workout_session', id);
    }
  });
}

export function deleteAllCompletedSessions(): void {
  inTransaction(() => {
    const setIds = query<{ id: string }>(
      `
      SELECT ws.id AS id
      FROM workout_set ws
      JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
      JOIN workout_session wsession ON wsession.id = wse.workout_session_id
      WHERE wsession.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND wsession.deleted_at IS NULL
        AND wse.deleted_at IS NULL
        AND ws.deleted_at IS NULL;
    `,
    ).map((row) => row.id);

    const sessionExerciseIds = query<{ id: string }>(
      `
      SELECT wse.id AS id
      FROM workout_session_exercise wse
      JOIN workout_session ws ON ws.id = wse.workout_session_id
      WHERE ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND ws.deleted_at IS NULL
        AND wse.deleted_at IS NULL;
    `,
    ).map((row) => row.id);

    const sessionIds = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session
      WHERE status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND deleted_at IS NULL;
    `,
    ).map((row) => row.id);

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
    for (const setId of setIds) {
      enqueueEntitySnapshot('workout_set', setId);
    }
    for (const sessionExerciseId of sessionExerciseIds) {
      enqueueEntitySnapshot('workout_session_exercise', sessionExerciseId);
    }
    for (const sessionId of sessionIds) {
      enqueueEntitySnapshot('workout_session', sessionId);
    }
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

  const isCompletedStrengthSet = (set: SessionSetRow): boolean => set.is_completed === 1;

  const completedStrengthSets = (sets: SessionSetRow[]): SessionSetRow[] =>
    sets.filter(isCompletedStrengthSet);

  const hasCardioSummary = (exercise: SessionExerciseRow): boolean =>
    exercise.cardio_duration_minutes !== null ||
    exercise.cardio_distance_km !== null ||
    exercise.cardio_speed_kph !== null ||
    exercise.cardio_incline_percent !== null ||
    exercise.cardio_resistance_level !== null ||
    exercise.cardio_pace_seconds_per_km !== null ||
    exercise.cardio_floors !== null ||
    exercise.cardio_stair_level !== null;

  // History should represent performed work only:
  // - strength: at least one completed set exists
  // - cardio: at least one cardio summary field is populated
  const completedExercisesWithSets = detail.exercises
    .map((exercise) => ({
      exercise,
      performedSets:
        exercise.exercise_type === 'cardio' ? [] : completedStrengthSets(exercise.sets),
    }))
    .filter(({ exercise, performedSets }) =>
      exercise.exercise_type === 'cardio' ? hasCardioSummary(exercise) : performedSets.length > 0,
    );

  const exercises: SessionExerciseRow[] = completedExercisesWithSets.map(({ exercise }) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    exercise_name: exercise.exercise_name,
    exercise_type: exercise.exercise_type,
    cardio_profile: exercise.cardio_profile,
    position: exercise.position,
    notes: exercise.notes,
    cardio_duration_minutes: exercise.cardio_duration_minutes,
    cardio_distance_km: exercise.cardio_distance_km,
    cardio_speed_kph: exercise.cardio_speed_kph,
    cardio_incline_percent: exercise.cardio_incline_percent,
    cardio_resistance_level: exercise.cardio_resistance_level,
    cardio_pace_seconds_per_km: exercise.cardio_pace_seconds_per_km,
    cardio_floors: exercise.cardio_floors,
    cardio_stair_level: exercise.cardio_stair_level,
  }));

  const sets: SessionSetRow[] = completedExercisesWithSets.flatMap(
    ({ performedSets }) => performedSets,
  );

  return { session, exercises, sets };
}
