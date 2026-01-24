import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { detectAndStorePrsForSession } from './prRepo';
import { enqueueOutboxOp } from './outboxRepo';
import { WORKOUT_SESSION_STATUS, type WorkoutSessionStatus } from './constants';

const DEFAULT_REST_SECONDS = 90;

export type WorkoutSessionRow = {
  id: string;
  source_workout_plan_id: string | null;
  source_program_day_id: string | null;
  title: string;
  status: WorkoutSessionStatus;
  started_at: string;
  ended_at: string | null;
};

export type WorkoutSessionExerciseRow = {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  notes: string | null;
};

function enqueueWorkoutSessionSnapshot(sessionId: string) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM workout_session
    WHERE id = ?
    LIMIT 1;
  `,
    [sessionId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'workout_session',
    entityId: sessionId,
    opType: 'upsert',
    payloadJson: JSON.stringify(row),
  });
}

function enqueueWorkoutSessionExerciseSnapshot(wseId: string) {
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
    opType: 'upsert',
    payloadJson: JSON.stringify(row),
  });
}

function enqueueWorkoutSetSnapshot(setId: string) {
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
    opType: 'upsert',
    payloadJson: JSON.stringify(row),
  });
}

export function getInProgressSession(): WorkoutSessionRow | null {
  const rows = query<WorkoutSessionRow>(
    `
    SELECT
      id,
      source_workout_plan_id,
      source_program_day_id,
      title,
      status,
      started_at,
      ended_at
    FROM workout_session
    WHERE status = '${WORKOUT_SESSION_STATUS.IN_PROGRESS}' AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  `,
  );
  return rows[0] ?? null;
}

export function getSessionById(sessionId: string): WorkoutSessionRow | null {
  const rows = query<WorkoutSessionRow>(
    `
    SELECT
      id,
      source_workout_plan_id,
      source_program_day_id,
      title,
      status,
      started_at,
      ended_at
    FROM workout_session
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId],
  );
  return rows[0] ?? null;
}

export function listSessionExercises(sessionId: string): WorkoutSessionExerciseRow[] {
  return query<WorkoutSessionExerciseRow>(
    `
    SELECT
      id,
      workout_session_id,
      exercise_id,
      exercise_name,
      position,
      notes
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND deleted_at IS NULL
    ORDER BY position ASC;
  `,
    [sessionId],
  );
}

export function createSessionFromPlanDay(input: { workoutPlanId: string; dayId: string }): string {
  const existing = query<{ id: string }>(
    `
  SELECT id
  FROM workout_session
  WHERE status = '${WORKOUT_SESSION_STATUS.IN_PROGRESS}' AND deleted_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;
`,
  )[0];

  if (existing) {
    throw new Error(`WORKOUT_IN_PROGRESS:${existing.id}`);
  }

  const { workoutPlanId, dayId } = input;

  return inTransaction(() => {
    // Read day name (snapshot title)
    const day = query<{ day_name: string | null; day_index: number }>(
      `
      SELECT name AS day_name, day_index
      FROM program_day
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [dayId],
    )[0];

    if (!day) throw new Error('createSessionFromPlanDay: day not found');

    const title = day.day_name ?? `Day ${day.day_index}`;

    // Read day exercises in order (snapshot exercise_name)
    const exRows = query<{
      day_exercise_id: string;
      exercise_id: string;
      exercise_name: string;
      position: number;
    }>(
      `
      SELECT
      pde.id AS day_exercise_id,
        pde.exercise_id AS exercise_id,
        e.name AS exercise_name,
        pde.position AS position
      FROM program_day_exercise pde
      JOIN exercise e ON e.id = pde.exercise_id
      WHERE pde.program_day_id = ?
        AND pde.deleted_at IS NULL
        AND e.deleted_at IS NULL
      ORDER BY pde.position ASC;
    `,
      [dayId],
    );

    const sessionId = newId('ws');

    exec(
      `
      INSERT INTO workout_session (
        id,
        source_workout_plan_id,
        source_program_day_id,
        title,
        status,
        started_at
       ) VALUES (?, ?, ?, ?, '${WORKOUT_SESSION_STATUS.IN_PROGRESS}', datetime('now'));
    `,
      [sessionId, workoutPlanId, dayId, title],
    );

    enqueueWorkoutSessionSnapshot(sessionId);

    for (let i = 0; i < exRows.length; i += 1) {
      const row = exRows[i];
      const wseId = newId('wse');

      exec(
        `
        INSERT INTO workout_session_exercise (
          id,
          workout_session_id,
          exercise_id,
          exercise_name,
          position,
          notes
        ) VALUES (?, ?, ?, ?, ?, NULL);
      `,
        [wseId, sessionId, row.exercise_id, row.exercise_name, row.position],
      );

      enqueueWorkoutSessionExerciseSnapshot(wseId);

      const plannedSets = query<{
        set_index: number;
        target_reps_min: number | null;
        rest_seconds: number | null;
      }>(
        `
        SELECT set_index, target_reps_min, rest_seconds
        FROM planned_set
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL
        ORDER BY set_index ASC;
      `,
        [row.day_exercise_id],
      );
      if (plannedSets.length > 0) {
        for (const plannedSet of plannedSets) {
          const setId = newId('set');
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
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 0);
          `,
            [
              setId,
              wseId,
              plannedSet.set_index,
              0,
              plannedSet.target_reps_min ?? 0,
              plannedSet.rest_seconds ?? DEFAULT_REST_SECONDS,
            ],
          );
          enqueueWorkoutSetSnapshot(setId);
        }
      } else {
        const setId = newId('set');
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
          ) VALUES (?, ?, ?, 0, 0, NULL, ?, NULL, 0);
        `,
          [setId, wseId, 1, DEFAULT_REST_SECONDS],
        );
        enqueueWorkoutSetSnapshot(setId);
      }
    }

    return sessionId;
  });
}

export function completeSession(sessionId: string) {
  inTransaction(() => {
    exec(
      `
      UPDATE workout_session
       SET status = '${WORKOUT_SESSION_STATUS.COMPLETED}', ended_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [sessionId],
    );
    enqueueWorkoutSessionSnapshot(sessionId);

    // Run PR detection AFTER marking completed
    detectAndStorePrsForSession(sessionId);
  });
}

export function discardSession(sessionId: string) {
  inTransaction(() => {
    exec(
      `
      UPDATE workout_session
      SET status = '${WORKOUT_SESSION_STATUS.DISCARDED}', ended_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [sessionId],
    );

    enqueueWorkoutSessionSnapshot(sessionId);
  });
}
