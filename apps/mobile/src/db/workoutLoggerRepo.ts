import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';
import { DEFAULT_REST_SECONDS, type WorkoutSessionStatus } from './constants';
import { fetchSessionDetail } from './sessionDetailRepo';

export type LoggerSession = {
  id: string;
  title: string;
  status: WorkoutSessionStatus;
  rest_timer_end_at: string | null;
  rest_timer_seconds: number | null;
  rest_timer_label: string | null;
};

export type LoggerExercise = {
  id: string; // workout_session_exercise.id
  exercise_id: string;
  exercise_name: string;
  position: number;
  sets: LoggerSet[];
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
} {
  const detail = fetchSessionDetail(sessionId);
  if (!detail) throw new Error('Session not found');

  const session: LoggerSession = {
    id: detail.session.id,
    title: detail.session.title,
    status: detail.session.status as WorkoutSessionStatus,
    rest_timer_end_at: detail.session.rest_timer_end_at,
    rest_timer_seconds: detail.session.rest_timer_seconds,
    rest_timer_label: detail.session.rest_timer_label,
  };

  const exercises: LoggerExercise[] = detail.exercises.map((exercise) => ({
    id: exercise.id,
    exercise_id: exercise.exercise_id,
    exercise_name: exercise.exercise_name,
    position: exercise.position,
    sets: exercise.sets,
  }));

  return { session, exercises };
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

export function startRestTimer(sessionId: string, seconds: number, label: string) {
  exec(
    `
    UPDATE workout_session
    SET
      rest_timer_end_at = datetime('now'),
      rest_timer_seconds = ?,
      rest_timer_label = ?,
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [seconds, label, sessionId],
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
