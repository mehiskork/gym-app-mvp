import { query } from './db';
import { WORKOUT_SESSION_STATUS } from './constants';
import { exec } from './db';
import { getOrCreateLocalUserId } from './appMetaRepo';

export type ExerciseRow = {
  id: string;
  name: string;
  is_custom: number;
  owner_user_id: string | null;
};

export type ExerciseDeletionState = {
  canRequestDelete: boolean;
  canDelete: boolean;
  blockReason: string | null;
};

export type ExerciseSessionRow = {
  session_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  wse_id: string; // workout_session_exercise id
};

export type ExerciseSetRow = {
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

export type SessionWithSets = {
  session_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  wse_id: string;
  sets: ExerciseSetRow[];
};

export function getExerciseById(exerciseId: string): ExerciseRow | null {
  const row = query<ExerciseRow>(
    `
     SELECT id, name, is_custom, owner_user_id
    FROM exercise
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  return row ?? null;
}

export function getExerciseDeletionState(exerciseId: string): ExerciseDeletionState {
  const ownerUserId = getOrCreateLocalUserId();
  const exercise = getExerciseById(exerciseId);

  if (!exercise) {
    return {
      canRequestDelete: false,
      canDelete: false,
      blockReason: 'Exercise not found.',
    };
  }

  if (exercise.is_custom !== 1 || exercise.owner_user_id !== ownerUserId) {
    return {
      canRequestDelete: false,
      canDelete: false,
      blockReason: 'Only your custom exercises can be deleted.',
    };
  }

  const planRefs =
    query<{ n: number }>(
      `
    SELECT COUNT(*) AS n
    FROM program_day_exercise
    WHERE exercise_id = ?
      AND deleted_at IS NULL;
  `,
      [exerciseId],
    )[0]?.n ?? 0;

  const workoutRefs =
    query<{ n: number }>(
      `
    SELECT COUNT(*) AS n
    FROM workout_session_exercise wse
    JOIN workout_session ws ON ws.id = wse.workout_session_id
    WHERE wse.exercise_id = ?
      AND wse.deleted_at IS NULL
      AND ws.deleted_at IS NULL
      AND ws.status IN (?, ?);
  `,
      [exerciseId, WORKOUT_SESSION_STATUS.IN_PROGRESS, WORKOUT_SESSION_STATUS.COMPLETED],
    )[0]?.n ?? 0;

  if (planRefs > 0 || workoutRefs > 0) {
    return {
      canRequestDelete: true,
      canDelete: false,
      blockReason: 'This exercise is used in plans or workouts and cannot be deleted yet.',
    };
  }

  return {
    canRequestDelete: true,
    canDelete: true,
    blockReason: null,
  };
}

export function deleteCustomExerciseIfUnused(exerciseId: string) {
  const ownerUserId = getOrCreateLocalUserId();
  const state = getExerciseDeletionState(exerciseId);

  if (!state.canDelete) {
    throw new Error(state.blockReason ?? 'Exercise cannot be deleted.');
  }

  exec(
    `
    UPDATE exercise
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
      AND is_custom = 1
      AND owner_user_id = ?
      AND deleted_at IS NULL;
  `,
    [exerciseId, ownerUserId],
  );
}

export function listExerciseSessionsWithSets(
  exerciseId: string,
  limitSessions = 5,
): SessionWithSets[] {
  const sessions = query<ExerciseSessionRow>(
    `
    SELECT
      ws.id AS session_id,
      ws.title AS title,
      ws.started_at AS started_at,
      ws.ended_at AS ended_at,
      wse.id AS wse_id
    FROM workout_session_exercise wse
    JOIN workout_session ws ON ws.id = wse.workout_session_id
    WHERE wse.exercise_id = ?
      AND wse.deleted_at IS NULL
      AND ws.deleted_at IS NULL
      AND ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
    ORDER BY COALESCE(ws.ended_at, ws.started_at) DESC
    LIMIT ?;
  `,
    [exerciseId, limitSessions],
  );

  if (sessions.length === 0) return [];

  const wseIds = sessions.map((s) => s.wse_id);
  const placeholders = wseIds.map(() => '?').join(', ');

  const sets = query<ExerciseSetRow>(
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
    WHERE workout_session_exercise_id IN (${placeholders})
      AND deleted_at IS NULL
    ORDER BY workout_session_exercise_id ASC, set_index ASC;
  `,
    wseIds,
  );

  const setsByWse = new Map<string, ExerciseSetRow[]>();
  for (const s of sets) {
    const arr = setsByWse.get(s.workout_session_exercise_id) ?? [];
    arr.push(s);
    setsByWse.set(s.workout_session_exercise_id, arr);
  }

  return sessions.map((s) => ({
    ...s,
    sets: setsByWse.get(s.wse_id) ?? [],
  }));
}
