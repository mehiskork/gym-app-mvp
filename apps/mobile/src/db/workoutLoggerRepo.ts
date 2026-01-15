import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';

const DEFAULT_REST_SECONDS = 90;

export type LoggerSession = {
  id: string;
  title: string;
  status: 'in_progress' | 'completed' | 'discarded';
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

function normalizeDeletedSetIndices(wseId: string) {
  const deleted = query<{ id: string }>(
    `
    SELECT id
    FROM workout_set
    WHERE workout_session_exercise_id = ? AND deleted_at IS NOT NULL
    ORDER BY set_index ASC;
  `,
    [wseId],
  );

  if (deleted.length === 0) return;

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
}

function compactActiveSets(wseId: string) {
  normalizeDeletedSetIndices(wseId);

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
  }
}

function insertBlankSet(wseId: string, setIndex: number) {
  const id = newId('set');
  exec(
    `
    INSERT INTO workout_set (
      id, workout_session_exercise_id, set_index,
      weight, reps, rpe, rest_seconds, notes, is_completed
    ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, 0);
  `,
    [id, wseId, setIndex, DEFAULT_REST_SECONDS],
  );
}

function prefillSetsFromLastCompleted(wseId: string, exerciseId: string) {
  // Find most recent completed session exercise for same exercise_id
  const last = query<{ last_wse_id: string }>(
    `
    SELECT wse.id AS last_wse_id
    FROM workout_session_exercise wse
    JOIN workout_session ws ON ws.id = wse.workout_session_id
    WHERE wse.exercise_id = ?
      AND wse.deleted_at IS NULL
      AND ws.deleted_at IS NULL
      AND ws.status = 'completed'
    ORDER BY COALESCE(ws.ended_at, ws.started_at) DESC
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  if (!last?.last_wse_id) {
    insertBlankSet(wseId, 1);
    return;
  }

  const lastSets = query<{
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    rest_seconds: number | null;
  }>(
    `
    SELECT weight, reps, rpe, rest_seconds
    FROM workout_set
    WHERE workout_session_exercise_id = ?
      AND deleted_at IS NULL
    ORDER BY set_index ASC
    LIMIT 10;
  `,
    [last.last_wse_id],
  );

  if (lastSets.length === 0) {
    insertBlankSet(wseId, 1);
    return;
  }

  for (let i = 0; i < lastSets.length; i += 1) {
    const id = newId('set');
    const s = lastSets[i];
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
        i + 1,
        s.weight ?? null,
        s.reps ?? null,
        s.rpe ?? null,
        s.rest_seconds ?? DEFAULT_REST_SECONDS,
      ],
    );
  }
}

export function ensurePrefilledSetsForSession(sessionId: string) {
  inTransaction(() => {
    const exercises = query<{ id: string; exercise_id: string }>(
      `
      SELECT id, exercise_id
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND deleted_at IS NULL
      ORDER BY position ASC;
    `,
      [sessionId],
    );

    for (const ex of exercises) {
      const activeCount =
        query<{ n: number }>(
          `
          SELECT COUNT(*) AS n
          FROM workout_set
          WHERE workout_session_exercise_id = ? AND deleted_at IS NULL;
        `,
          [ex.id],
        )[0]?.n ?? 0;

      if (activeCount > 0) continue;

      // IMPORTANT: if sets existed before (even deleted), do NOT prefill again.
      const everCount =
        query<{ n: number }>(
          `
          SELECT COUNT(*) AS n
          FROM workout_set
          WHERE workout_session_exercise_id = ?;
        `,
          [ex.id],
        )[0]?.n ?? 0;

      if (everCount > 0) continue;

      // First time ever -> prefill
      prefillSetsFromLastCompleted(ex.id, ex.exercise_id);
      compactActiveSets(ex.id);
    }
  });
}

export function getWorkoutLoggerData(sessionId: string): {
  session: LoggerSession;
  exercises: LoggerExercise[];
} {
  ensurePrefilledSetsForSession(sessionId);

  const session = query<LoggerSession>(
    `
    SELECT
      id, title, status,
      rest_timer_end_at, rest_timer_seconds, rest_timer_label
    FROM workout_session
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId],
  )[0];

  if (!session) throw new Error('Session not found');

  const exRows = query<{
    id: string;
    exercise_id: string;
    exercise_name: string;
    position: number;
  }>(
    `
    SELECT id, exercise_id, exercise_name, position
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND deleted_at IS NULL
    ORDER BY position ASC;
  `,
    [sessionId],
  );

  const setRows = query<LoggerSet>(
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
      SELECT id
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND deleted_at IS NULL
    )
      AND deleted_at IS NULL
    ORDER BY workout_session_exercise_id ASC, set_index ASC;
  `,
    [sessionId],
  );

  const setsByWse = new Map<string, LoggerSet[]>();
  for (const s of setRows) {
    const arr = setsByWse.get(s.workout_session_exercise_id) ?? [];
    arr.push(s);
    setsByWse.set(s.workout_session_exercise_id, arr);
  }

  const exercises: LoggerExercise[] = exRows.map((e) => ({
    id: e.id,
    exercise_id: e.exercise_id,
    exercise_name: e.exercise_name,
    position: e.position,
    sets: setsByWse.get(e.id) ?? [],
  }));

  return { session, exercises };
}

export function addWorkoutSet(wseId: string): string {
  return inTransaction(() => {
    compactActiveSets(wseId);

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
        last?.weight ?? null,
        last?.reps ?? null,
        last?.rpe ?? null,
        last?.rest_seconds ?? DEFAULT_REST_SECONDS,
      ],
    );

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

  exec(
    `
    UPDATE workout_set
    SET ${cols}, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [...params, setId],
  );
}

export function deleteWorkoutSet(setId: string) {
  exec(
    `
    UPDATE workout_set
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [setId],
  );
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
