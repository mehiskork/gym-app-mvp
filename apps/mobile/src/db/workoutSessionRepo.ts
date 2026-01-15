import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';

export type WorkoutSessionRow = {
  id: string;
  source_workout_plan_id: string | null;
  source_program_day_id: string | null;
  title: string;
  status: 'in_progress' | 'completed' | 'discarded';
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
    WHERE status = 'in_progress' AND deleted_at IS NULL
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
    const exRows = query<{ exercise_id: string; exercise_name: string; position: number }>(
      `
      SELECT
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
      ) VALUES (?, ?, ?, ?, 'in_progress', datetime('now'));
    `,
      [sessionId, workoutPlanId, dayId, title],
    );

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
        [wseId, sessionId, row.exercise_id, row.exercise_name, i + 1],
      );
    }

    return sessionId;
  });
}

export function completeSession(sessionId: string) {
  exec(
    `
    UPDATE workout_session
    SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [sessionId],
  );
}

export function discardSession(sessionId: string) {
  exec(
    `
    UPDATE workout_session
    SET status = 'discarded', ended_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [sessionId],
  );
}
