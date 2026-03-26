import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';
import { DEFAULT_REST_SECONDS, type WorkoutSessionStatus } from './constants';
import { fetchSessionDetail } from './sessionDetailRepo';
import { EXERCISE_TYPE, type CardioProfile, type CardioSummary, type ExerciseType } from './exerciseTypes';

const EXERCISE_POSITION_SHIFT_OFFSET = 1_000_000;

export type LoggerSession = {
  id: string;
  title: string;
  status: WorkoutSessionStatus;
  started_at: string;
  rest_timer_end_at: string | null;
  rest_timer_seconds: number | null;
  rest_timer_label: string | null;
  workout_note: string | null;
};

export type LoggerExercise = {
  id: string; // workout_session_exercise.id
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  cardio_profile: CardioProfile | null;
  position: number;
  sets: LoggerSet[];
  notes: string | null;
  cardio_summary: CardioSummary;
};

export type LoggerSet = {
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

export type RestoreWorkoutSetInput = LoggerSet;

function enqueueWorkoutSessionExerciseSnapshot(wseId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM workout_session_exercise
    WHERE id = ?
    LIMIT 1;
  `,
    [wseId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'workout_session_exercise',
    entityId: wseId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function normalizeDeletedSetIndices(wseId: string): string[] {
  const deleted = query<{ id: string }>(
    `
    SELECT id
    FROM workout_set
    WHERE workout_session_exercise_id = ? AND deleted_at IS NOT NULL
    ORDER BY set_index ASC;
  `,
    [wseId],
  );

  if (deleted.length === 0) {
    return [];
  }

  const minIdx =
    query<{ min_idx: number }>(
      `
      SELECT COALESCE(MIN(set_index), 0) AS min_idx
      FROM workout_set
      WHERE workout_session_exercise_id = ?;
    `,
      [wseId],
    )[0]?.min_idx ?? 0;

  const base = minIdx - 1000;

  for (let i = 0; i < deleted.length; i += 1) {
    exec('UPDATE workout_set SET set_index = ? WHERE id = ?', [base - (i + 1), deleted[i].id]);
  }

  const deletedIds = deleted.map((row) => row.id);
  return deletedIds;
}

function compactActiveSets(wseId: string): string[] {
  const mutatedIds = new Set<string>(normalizeDeletedSetIndices(wseId));

  const active = query<{ id: string }>(
    `
    SELECT id
    FROM workout_set
    WHERE workout_session_exercise_id = ? AND deleted_at IS NULL
    ORDER BY set_index ASC;
  `,
    [wseId],
  );

  for (let i = 0; i < active.length; i += 1) {
    exec('UPDATE workout_set SET set_index = ? WHERE id = ?', [-(i + 1), active[i].id]);
    mutatedIds.add(active[i].id);
  }

  for (let i = 0; i < active.length; i += 1) {
    exec(
      `
      UPDATE workout_set
      SET set_index = ?, updated_at = datetime('now')
      WHERE id = ?;
    `,
      [i + 1, active[i].id],
    );
    mutatedIds.add(active[i].id);
  }
  return Array.from(mutatedIds);
}

function enqueueWorkoutSetSnapshot(setId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM workout_set
    WHERE id = ?
    LIMIT 1;
  `,
    [setId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'workout_set',
    entityId: setId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

export function getWorkoutLoggerData(sessionId: string): {
  session: LoggerSession;
  exercises: LoggerExercise[];
} | null {
  const detail = fetchSessionDetail(sessionId);
  if (!detail) return null;

  const session: LoggerSession = {
    id: detail.session.id,
    title: detail.session.title,
    status: detail.session.status as WorkoutSessionStatus,
    started_at: detail.session.started_at,
    rest_timer_end_at: detail.session.rest_timer_end_at,
    rest_timer_seconds: detail.session.rest_timer_seconds,
    rest_timer_label: detail.session.rest_timer_label,
    workout_note: detail.session.workout_note,
  };

  const exercises: LoggerExercise[] = detail.exercises.map((exercise) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    exercise_name: exercise.exercise_name,
    exercise_type: exercise.exercise_type,
    cardio_profile: exercise.cardio_profile,
    position: exercise.position,
    sets: exercise.sets,
    notes: exercise.notes,
    cardio_summary: {
      duration_seconds: exercise.cardio_duration_seconds,
      distance_km: exercise.cardio_distance_km,
      speed_kph: exercise.cardio_speed_kph,
      incline_percent: exercise.cardio_incline_percent,
      resistance_level: exercise.cardio_resistance_level,
      pace_seconds_per_km: exercise.cardio_pace_seconds_per_km,
      floors: exercise.cardio_floors,
      stair_level: exercise.cardio_stair_level,
    },
  }));

  return { session, exercises };
}

export function swapWorkoutSessionExercise(input: {
  workoutSessionId: string;
  workoutSessionExerciseId: string;
  replacementExerciseId: string;
  replacementExerciseName: string;
}): { focusExerciseId: string } {
  const { workoutSessionId, workoutSessionExerciseId, replacementExerciseId, replacementExerciseName } = input;
  const replacementMeta = getExerciseMeta(replacementExerciseId);

  return inTransaction(() => {
    const current = query<{ id: string; position: number }>(
      `
      SELECT id, position
      FROM workout_session_exercise
      WHERE id = ? AND workout_session_id = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [workoutSessionExerciseId, workoutSessionId],
    )[0];

    if (!current) {
      throw new Error('swapWorkoutSessionExercise: current session exercise not found');
    }

    const completedSets =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM workout_set
        WHERE workout_session_exercise_id = ?
          AND deleted_at IS NULL
          AND is_completed = 1;
      `,
        [workoutSessionExerciseId],
      )[0]?.n ?? 0;

    if (completedSets === 0) {
      exec(
        `
        UPDATE workout_session_exercise
         SET exercise_id = ?, exercise_name = ?, exercise_type = ?, cardio_profile = ?, updated_at = datetime('now')
        WHERE id = ?;
      `,
        [
          replacementExerciseId,
          replacementExerciseName,
          replacementMeta.exercise_type,
          replacementMeta.cardio_profile,
          workoutSessionExerciseId,
        ],
      );
      enqueueWorkoutSessionExerciseSnapshot(workoutSessionExerciseId);
      return { focusExerciseId: workoutSessionExerciseId };
    }

    exec(
      `
      UPDATE workout_session_exercise
      SET position = position + ?, updated_at = datetime('now')
      WHERE workout_session_id = ?
        AND deleted_at IS NULL
        AND position > ?;
    `,
      [EXERCISE_POSITION_SHIFT_OFFSET, workoutSessionId, current.position],
    );

    const insertedId = newId('wse');
    exec(
      `
      INSERT INTO workout_session_exercise (
        id,
        workout_session_id,
        exercise_id,
        exercise_name,
         exercise_type,
        cardio_profile,
        position,
        notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL);
    `,
      [
        insertedId,
        workoutSessionId,
        replacementExerciseId,
        replacementExerciseName,
        replacementMeta.exercise_type,
        replacementMeta.cardio_profile,
        current.position + 1,
      ],
    );

    exec(
      `
      UPDATE workout_session_exercise
      SET position = position - ?, updated_at = datetime('now')
      WHERE workout_session_id = ?
        AND deleted_at IS NULL
        AND position > ?;
    `,
      [EXERCISE_POSITION_SHIFT_OFFSET - 1, workoutSessionId, current.position + EXERCISE_POSITION_SHIFT_OFFSET],
    );

    let setId: string | null = null;
    if (replacementMeta.exercise_type === EXERCISE_TYPE.STRENGTH) {
      setId = newId('set');
      exec(
        `
        INSERT INTO workout_set (
          id,
          workout_session_exercise_id,
          set_index,
          weight,
          reps,
          rpe,
          rest_seconds,
          notes,
          is_completed
        ) VALUES (?, ?, 1, 0, 0, NULL, ?, NULL, 0);
      `,
        [setId, insertedId, DEFAULT_REST_SECONDS],
      );
    }

    enqueueWorkoutSessionExerciseSnapshot(insertedId);
    if (setId) enqueueWorkoutSetSnapshot(setId);

    return { focusExerciseId: insertedId };
  });
}

export function appendWorkoutSessionExercise(input: {
  workoutSessionId: string;
  exerciseId: string;
  exerciseName: string;
}): { focusExerciseId: string } {
  const { workoutSessionId, exerciseId, exerciseName } = input;
  const exerciseMeta = getExerciseMeta(exerciseId);

  return inTransaction(() => {
    const session = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session
      WHERE id = ?
        AND status = 'in_progress'
        AND deleted_at IS NULL
      LIMIT 1;
    `,
      [workoutSessionId],
    )[0];

    if (!session) {
      throw new Error('appendWorkoutSessionExercise: workout session not found');
    }

    const maxPosition =
      query<{ max_position: number | null }>(
        `
        SELECT MAX(position) AS max_position
        FROM workout_session_exercise
        WHERE workout_session_id = ? AND deleted_at IS NULL;
      `,
        [workoutSessionId],
      )[0]?.max_position ?? 0;

    const insertedId = newId('wse');
    exec(
      `
      INSERT INTO workout_session_exercise (
        id,
        workout_session_id,
        source_program_day_exercise_id,
        exercise_id,
        exercise_name,
         exercise_type,
        cardio_profile,
        position,
        notes
       ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL);
    `,
      [
        insertedId,
        workoutSessionId,
        exerciseId,
        exerciseName,
        exerciseMeta.exercise_type,
        exerciseMeta.cardio_profile,
        maxPosition + 1,
      ],
    );

    let setId: string | null = null;
    if (exerciseMeta.exercise_type === EXERCISE_TYPE.STRENGTH) {
      setId = newId('set');
      exec(
        `
        INSERT INTO workout_set (
          id,
          workout_session_exercise_id,
          set_index,
          weight,
          reps,
          rpe,
          rest_seconds,
          notes,
          is_completed
        ) VALUES (?, ?, 1, 0, 0, NULL, ?, NULL, 0);
      `,
        [setId, insertedId, DEFAULT_REST_SECONDS],
      );
    }

    enqueueWorkoutSessionExerciseSnapshot(insertedId);
    if (setId) enqueueWorkoutSetSnapshot(setId);

    return { focusExerciseId: insertedId };
  });
}

function getExerciseMeta(exerciseId: string): {
  exercise_type: ExerciseType;
  cardio_profile: CardioProfile | null;
} {
  const row = query<{ exercise_type: ExerciseType; cardio_profile: CardioProfile | null }>(
    `
    SELECT exercise_type, cardio_profile
    FROM exercise
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [exerciseId],
  )[0];
  if (!row) {
    throw new Error('exercise not found');
  }
  return row;
}


export function addWorkoutSet(wseId: string): string {
  return inTransaction(() => {
    const compactedIds = compactActiveSets(wseId);

    const last = query<Pick<LoggerSet, 'weight' | 'reps' | 'rpe' | 'rest_seconds'>>(
      `
      SELECT weight, reps, rpe, rest_seconds
      FROM workout_set
      WHERE workout_session_exercise_id = ? AND deleted_at IS NULL
      ORDER BY set_index DESC
      LIMIT 1;
    `,
      [wseId],
    )[0];

    const count =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM workout_set
        WHERE workout_session_exercise_id = ? AND deleted_at IS NULL;
      `,
        [wseId],
      )[0]?.n ?? 0;

    const nextIndex = count + 1;
    const id = newId('set');

    exec(
      `
      INSERT INTO workout_set (
        id, workout_session_exercise_id, set_index,
        weight, reps, rpe, rest_seconds, notes, is_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0);
    `,
      [
        id,
        wseId,
        nextIndex,
        0,
        last?.reps ?? 0,
        last?.rpe ?? null,
        last?.rest_seconds ?? DEFAULT_REST_SECONDS,
      ],
    );

    for (const setId of compactedIds) {
      enqueueWorkoutSetSnapshot(setId);
    }
    enqueueWorkoutSetSnapshot(id);

    return id;
  });
}

export function updateWorkoutSessionExerciseCardioSummary(
  wseId: string,
  patch: Partial<CardioSummary>,
) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  const cols = entries.map(([key]) => `cardio_${key} = ?`).join(', ');
  const params = entries.map(([, value]) => value);

  inTransaction(() => {
    const row = query<{ status: WorkoutSessionStatus; exercise_type: ExerciseType }>(
      `
      SELECT ws.status AS status, wse.exercise_type AS exercise_type
      FROM workout_session_exercise wse
      JOIN workout_session ws ON ws.id = wse.workout_session_id
      WHERE wse.id = ?
        AND wse.deleted_at IS NULL
        AND ws.deleted_at IS NULL
      LIMIT 1;
    `,
      [wseId],
    )[0];

    if (!row) throw new Error('cardio exercise not found');
    if (row.status !== 'in_progress') return;
    if (row.exercise_type !== EXERCISE_TYPE.CARDIO) return;

    exec(
      `
      UPDATE workout_session_exercise
      SET ${cols}, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [...params, wseId],
    );
    enqueueWorkoutSessionExerciseSnapshot(wseId);
  });
}

export function updateWorkoutSessionExerciseComment(
  wseId: string,
  comment: string | null,
) {
  inTransaction(() => {
    const row = query<{ status: WorkoutSessionStatus }>(
      `
      SELECT ws.status AS status
      FROM workout_session_exercise wse
      JOIN workout_session ws ON ws.id = wse.workout_session_id
      WHERE wse.id = ?
        AND wse.deleted_at IS NULL
        AND ws.deleted_at IS NULL
      LIMIT 1;
    `,
      [wseId],
    )[0];

    if (!row) {
      throw new Error('updateWorkoutSessionExerciseComment: session exercise not found');
    }
    if (row.status !== 'in_progress') return;

    const trimmed = comment?.trim() ?? '';
    const normalized = trimmed.length === 0 ? null : trimmed.slice(0, 200);

    exec(
      `
      UPDATE workout_session_exercise
      SET notes = ?, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [normalized, wseId],
    );

    enqueueWorkoutSessionExerciseSnapshot(wseId);
  });
}

export function updateWorkoutSet(
  setId: string,
  patch: Partial<{
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    rest_seconds: number | null;
    notes: string | null;
    is_completed: number;
  }>,
) {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const cols = entries.map(([k]) => `${k} = ?`).join(', ');
  const params = entries.map(([, v]) => v);

  inTransaction(() => {
    exec(
      `
      UPDATE workout_set
      SET ${cols}, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [...params, setId],
    );

    enqueueWorkoutSetSnapshot(setId);
  });
}

export function deleteWorkoutSet(setId: string) {
  inTransaction(() => {
    exec(
      `
      UPDATE workout_set
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [setId],
    );

    enqueueWorkoutSetSnapshot(setId, 'delete');
  });
}

export function restoreWorkoutSet(set: RestoreWorkoutSetInput) {
  inTransaction(() => {
    const affected = query<{ id: string }>(
      `
      SELECT id
      FROM workout_set
      WHERE workout_session_exercise_id = ?
        AND deleted_at IS NULL
        AND set_index >= ?
      ORDER BY set_index ASC;
    `,
      [set.workout_session_exercise_id, set.set_index],
    );

    if (affected.length > 0) {
      exec(
        `
        UPDATE workout_set
        SET set_index = set_index + 1000, updated_at = datetime('now')
        WHERE workout_session_exercise_id = ?
          AND deleted_at IS NULL
          AND set_index >= ?;
      `,
        [set.workout_session_exercise_id, set.set_index],
      );
    }

    exec(
      `
      UPDATE workout_set
      SET
        deleted_at = NULL,
        updated_at = datetime('now'),
        set_index = ?,
        weight = ?,
        reps = ?,
        rpe = ?,
        rest_seconds = ?,
        notes = ?,
        is_completed = ?
      WHERE id = ?;
    `,
      [
        set.set_index,
        set.weight,
        set.reps,
        set.rpe,
        set.rest_seconds,
        set.notes,
        set.is_completed,
        set.id,
      ],
    );

    if (affected.length > 0) {
      exec(
        `
        UPDATE workout_set
        SET set_index = set_index - 999, updated_at = datetime('now')
        WHERE workout_session_exercise_id = ?
          AND deleted_at IS NULL
          AND set_index >= ?;
      `,
        [set.workout_session_exercise_id, set.set_index + 1000],
      );
    }

    for (const row of affected) {
      enqueueWorkoutSetSnapshot(row.id);
    }
    enqueueWorkoutSetSnapshot(set.id);
  });
}


export function startRestTimer(sessionId: string, seconds: number, label: string) {
  const clampedSeconds = Math.max(0, Math.floor(seconds));
  const offset = `+${clampedSeconds} seconds`;
  exec(
    `
    UPDATE workout_session
    SET
      rest_timer_end_at = datetime('now', ?),
      rest_timer_seconds = ?,
      rest_timer_label = ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [offset, clampedSeconds, label, sessionId],
  );
}

export function clearRestTimer(sessionId: string) {
  exec(
    `
    UPDATE workout_session
    SET
      rest_timer_end_at = NULL,
      rest_timer_seconds = NULL,
      rest_timer_label = NULL,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [sessionId],
  );
}
