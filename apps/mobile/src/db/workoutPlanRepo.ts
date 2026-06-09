import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  MAX_SESSIONS_PER_PLAN,
  WorkoutLimitError,
  WORKOUT_LIMIT_MESSAGES,
} from './workoutLimits';
import { WORKOUT_SESSION_STATUS } from './constants';

export type WorkoutPlanRow = {
  id: string;
  name: string;
  description: string | null;
  is_template: number;
};

export type WorkoutPlanWithSessionCountRow = WorkoutPlanRow & {
  sessionCount: number;
};

export type WorkoutPlanDayRow = {
  id: string;
  day_index: number;
  name: string | null;
};

export type SaveCompletedQuickWorkoutTarget =
  | { kind: 'newPlan'; name: string }
  | { kind: 'existingPlan'; workoutPlanId: string };

export type SaveCompletedQuickWorkoutResult = {
  workoutPlanId: string;
  programDayId: string;
  createdPlan: boolean;
};

type ReusableSessionRow = {
  id: string;
  title: string;
  source_workout_plan_id: string | null;
  source_program_day_id: string | null;
};

type CopyableExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_type: 'strength' | 'cardio';
  position: number;
  cardio_duration_minutes: number | null;
  cardio_distance_km: number | null;
  cardio_speed_kph: number | null;
  cardio_incline_percent: number | null;
  cardio_resistance_level: number | null;
  cardio_pace_seconds_per_km: number | null;
  cardio_floors: number | null;
  cardio_stair_level: number | null;
};

type CopyableSetRow = {
  workout_session_exercise_id: string;
  weight: number | null;
  reps: number | null;
  set_index: number;
};

function getOrCreateWeek1Id(workoutPlanId: string): string {
  const existing = query<{ id: string }>(
    `
    SELECT id
    FROM program_week
    WHERE program_id = ? AND week_index = 1 AND deleted_at IS NULL
    LIMIT 1;
  `,
    [workoutPlanId],
  )[0];

  if (existing?.id) return existing.id;

  const weekId = newId('week');
  exec(
    `
    INSERT INTO program_week (id, program_id, week_index)
    VALUES (?, ?, 1);
  `,
    [weekId, workoutPlanId],
  );
  return weekId;
}

function getOrCreateWeek1(workoutPlanId: string): { id: string; created: boolean } {
  const existing = query<{ id: string }>(
    `
    SELECT id
    FROM program_week
    WHERE program_id = ? AND week_index = 1 AND deleted_at IS NULL
    LIMIT 1;
  `,
    [workoutPlanId],
  )[0];

  if (existing?.id) return { id: existing.id, created: false };

  const id = newId('week');
  exec(
    `
    INSERT INTO program_week (id, program_id, week_index)
    VALUES (?, ?, 1);
  `,
    [id, workoutPlanId],
  );
  return { id, created: true };
}

function normalizeDeletedDayIndices(programWeekId: string) {
  const deleted = query<{ id: string }>(
    `
    SELECT id
    FROM program_day
    WHERE program_week_id = ? AND deleted_at IS NOT NULL
    ORDER BY day_index ASC;
  `,
    [programWeekId],
  );

  if (deleted.length === 0) return;

  const minIdx =
    query<{ min_idx: number }>(
      `
        SELECT COALESCE(MIN(day_index), 0) AS min_idx
        FROM program_day
        WHERE program_week_id = ?;
      `,
      [programWeekId],
    )[0]?.min_idx ?? 0;

  const base = minIdx - 1000;

  for (let i = 0; i < deleted.length; i += 1) {
    exec('UPDATE program_day SET day_index = ? WHERE id = ?', [base - (i + 1), deleted[i].id]);
  }
}

function enqueueProgramSnapshot(programId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program
    WHERE id = ?
    LIMIT 1;
  `,
    [programId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program',
    entityId: programId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function enqueueProgramWeekSnapshot(programWeekId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program_week
    WHERE id = ?
    LIMIT 1;
  `,
    [programWeekId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program_week',
    entityId: programWeekId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function enqueueProgramDaySnapshot(programDayId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program_day
    WHERE id = ?
    LIMIT 1;
  `,
    [programDayId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program_day',
    entityId: programDayId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function enqueueProgramDayExerciseSnapshot(
  programDayExerciseId: string,
  opType: 'upsert' | 'delete' = 'upsert',
) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program_day_exercise
    WHERE id = ?
    LIMIT 1;
  `,
    [programDayExerciseId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program_day_exercise',
    entityId: programDayExerciseId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function enqueuePlannedSetSnapshot(plannedSetId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM planned_set
    WHERE id = ?
    LIMIT 1;
  `,
    [plannedSetId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'planned_set',
    entityId: plannedSetId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function getActiveSessionCount(programWeekId: string): number {
  return (
    query<{ n: number }>(
      `
      SELECT COUNT(*) AS n
      FROM program_day
      WHERE program_week_id = ? AND deleted_at IS NULL;
    `,
      [programWeekId],
    )[0]?.n ?? 0
  );
}

function insertProgramDay(input: {
  weekId: string;
  dayIndex: number;
  name: string | null;
}): string {
  const dayId = newId('day');
  exec(
    `
    INSERT INTO program_day (id, program_week_id, day_index, name)
    VALUES (?, ?, ?, ?);
  `,
    [dayId, input.weekId, input.dayIndex, input.name],
  );
  return dayId;
}

function createReusablePlanSessionDay(input: {
  weekId: string;
  sessionName: string | null;
  enqueueSnapshot?: boolean;
}): string {
  normalizeDeletedDayIndices(input.weekId);
  compactActiveDays(input.weekId);

  const count = getActiveSessionCount(input.weekId);
  if (count >= MAX_SESSIONS_PER_PLAN) {
    throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxSessionsPerPlan);
  }

  const nextIndex = count + 1;
  const dayId = insertProgramDay({
    weekId: input.weekId,
    dayIndex: nextIndex,
    name: input.sessionName?.trim() || `Session ${nextIndex}`,
  });

  if (input.enqueueSnapshot !== false) {
    enqueueProgramDaySnapshot(dayId);
  }
  return dayId;
}

function listCopyableWorkoutExercises(sessionId: string): CopyableExerciseRow[] {
  return query<CopyableExerciseRow>(
    `
    SELECT
      wse.id,
      wse.exercise_id,
      wse.exercise_type,
      wse.position,
      wse.cardio_duration_minutes,
      wse.cardio_distance_km,
      wse.cardio_speed_kph,
      wse.cardio_incline_percent,
      wse.cardio_resistance_level,
      wse.cardio_pace_seconds_per_km,
      wse.cardio_floors,
      wse.cardio_stair_level
    FROM workout_session_exercise wse
    WHERE wse.workout_session_id = ?
      AND wse.deleted_at IS NULL
      AND (
        (
          wse.exercise_type = 'strength'
          AND EXISTS (
            SELECT 1
            FROM workout_set ws
            WHERE ws.workout_session_exercise_id = wse.id
              AND ws.deleted_at IS NULL
              AND ws.is_completed = 1
          )
        )
        OR (
          wse.exercise_type = 'cardio'
          AND (
            wse.cardio_duration_minutes IS NOT NULL OR
            wse.cardio_distance_km IS NOT NULL OR
            wse.cardio_speed_kph IS NOT NULL OR
            wse.cardio_incline_percent IS NOT NULL OR
            wse.cardio_resistance_level IS NOT NULL OR
            wse.cardio_pace_seconds_per_km IS NOT NULL OR
            wse.cardio_floors IS NOT NULL OR
            wse.cardio_stair_level IS NOT NULL
          )
        )
      )
    ORDER BY wse.position ASC;
  `,
    [sessionId],
  );
}

function listCompletedStrengthSets(sessionExerciseId: string): CopyableSetRow[] {
  return query<CopyableSetRow>(
    `
    SELECT
      workout_session_exercise_id,
      weight,
      reps,
      set_index
    FROM workout_set
    WHERE workout_session_exercise_id = ?
      AND deleted_at IS NULL
      AND is_completed = 1
    ORDER BY set_index ASC;
  `,
    [sessionExerciseId],
  );
}

function copyWorkoutExercisesIntoProgramDay(input: {
  sourceSessionId: string;
  programDayId: string;
}): void {
  const exercises = listCopyableWorkoutExercises(input.sourceSessionId);
  const dayExerciseIds: string[] = [];
  const plannedSetIds: string[] = [];

  if (exercises.length === 0) {
    throw new Error('No completed sets or cardio details to reuse.');
  }

  if (exercises.length > MAX_EXERCISES_PER_SESSION) {
    throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
  }

  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
    const exercise = exercises[exerciseIndex];
    const dayExerciseId = newId('day_ex');
    exec(
      `
      INSERT INTO program_day_exercise (
        id,
        program_day_id,
        exercise_id,
        position,
        notes,
        planned_cardio_duration_minutes,
        planned_cardio_distance_km,
        planned_cardio_speed_kph,
        planned_cardio_incline_percent,
        planned_cardio_resistance_level,
        planned_cardio_pace_seconds_per_km,
        planned_cardio_floors,
        planned_cardio_stair_level
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
      [
        dayExerciseId,
        input.programDayId,
        exercise.exercise_id,
        exerciseIndex + 1,
        exercise.cardio_duration_minutes,
        exercise.cardio_distance_km,
        exercise.cardio_speed_kph,
        exercise.cardio_incline_percent,
        exercise.cardio_resistance_level,
        exercise.cardio_pace_seconds_per_km,
        exercise.cardio_floors,
        exercise.cardio_stair_level,
      ],
    );
    dayExerciseIds.push(dayExerciseId);

    if (exercise.exercise_type !== 'strength') continue;

    const sets = listCompletedStrengthSets(exercise.id);
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const set = sets[setIndex];
      const plannedSetId = newId('pset');
      exec(
        `
        INSERT INTO planned_set (
          id,
          program_day_exercise_id,
          set_index,
          target_reps_min,
          target_reps_max,
          target_rpe,
          target_weight,
          rest_seconds
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL);
      `,
        [plannedSetId, dayExerciseId, setIndex + 1, set.reps, set.reps, set.weight],
      );
      plannedSetIds.push(plannedSetId);
    }
  }

  for (const dayExerciseId of dayExerciseIds) {
    enqueueProgramDayExerciseSnapshot(dayExerciseId);
  }

  for (const plannedSetId of plannedSetIds) {
    enqueuePlannedSetSnapshot(plannedSetId);
  }
}

export function listWorkoutPlans(): WorkoutPlanRow[] {
  return query<WorkoutPlanRow>(
    `
    SELECT id, name, description, is_template
    FROM program
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 100;
  `,
  );
}

export function listWorkoutPlansWithSessionCounts(): WorkoutPlanWithSessionCountRow[] {
  return query<WorkoutPlanWithSessionCountRow>(
    `
    SELECT
      p.id,
      p.name,
      p.description,
      p.is_template,
       COUNT(DISTINCT d.id) AS sessionCount
    FROM program p
    LEFT JOIN program_week w
      ON w.program_id = p.id
      AND w.week_index = 1
      AND w.deleted_at IS NULL
    LEFT JOIN program_day d
      ON d.program_week_id = w.id
      AND d.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.name, p.description, p.is_template
    ORDER BY p.updated_at DESC
    LIMIT 100;
  `,
  );
}

export function updateWorkoutPlanName(workoutPlanId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Workout plan name is required');

  inTransaction(() => {
    exec(
      `
      UPDATE program
      SET name = ?, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [trimmedName, workoutPlanId],
    );

    enqueueProgramSnapshot(workoutPlanId);
  });
}

export function getWorkoutPlanById(id: string): WorkoutPlanRow | null {
  const rows = query<WorkoutPlanRow>(
    `
    SELECT id, name, description, is_template
    FROM program
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [id],
  );
  return rows[0] ?? null;
}

export function listDaysForWorkoutPlan(workoutPlanId: string): WorkoutPlanDayRow[] {
  return query<WorkoutPlanDayRow>(
    `
    SELECT d.id, d.day_index, d.name
    FROM program_day d
    JOIN program_week w ON w.id = d.program_week_id
    WHERE w.program_id = ?
      AND w.week_index = 1
      AND w.deleted_at IS NULL
      AND d.deleted_at IS NULL
    ORDER BY d.day_index ASC;
  `,
    [workoutPlanId],
  );
}

function isDefaultDayName(name: string | null) {
  return name === null || /^(Day|Session)\s-?\d+$/.test(name);
}

function compactActiveDays(programWeekId: string) {
  const rows = query<{ id: string; name: string | null }>(
    `
    SELECT id, name
    FROM program_day
    WHERE program_week_id = ? AND deleted_at IS NULL
    ORDER BY day_index ASC;
  `,
    [programWeekId],
  );

  // temp negatives (safe)
  for (let i = 0; i < rows.length; i += 1) {
    exec('UPDATE program_day SET day_index = ? WHERE id = ?', [-(i + 1), rows[i].id]);
  }

  // final 1..N (+ fix default names)
  for (let i = 0; i < rows.length; i += 1) {
    const id = rows[i].id;
    exec("UPDATE program_day SET day_index = ?, updated_at = datetime('now') WHERE id = ?", [
      i + 1,
      id,
    ]);

    if (isDefaultDayName(rows[i].name)) {
      exec("UPDATE program_day SET name = ?, updated_at = datetime('now') WHERE id = ?", [
        `Session ${i + 1}`,
        id,
      ]);
    }
  }
}

export function addDayToWorkoutPlan(workoutPlanId: string): string {
  return inTransaction(() => {
    const weekId = getOrCreateWeek1Id(workoutPlanId);
    return createReusablePlanSessionDay({ weekId, sessionName: null });
  });
}

export function reorderWorkoutPlanDays(workoutPlanId: string, orderedDayIds: string[]) {
  inTransaction(() => {
    const week = query<{ id: string }>(
      `
      SELECT id
      FROM program_week
      WHERE program_id = ? AND week_index = 1 AND deleted_at IS NULL
      LIMIT 1;
    `,
      [workoutPlanId],
    )[0];

    if (!week?.id) throw new Error('reorderWorkoutPlanDays: week not found');

    // Fix old/legacy deleted rows that still have positive day_index values.
    normalizeDeletedDayIndices(week.id);

    const existingRows = query<{ id: string; day_index: number }>(
      `
      SELECT d.id, d.day_index
      FROM program_day d
      WHERE d.program_week_id = ? AND d.deleted_at IS NULL;
    `,
      [week.id],
    );

    const existing = existingRows.map((r) => r.id);
    const originalIndexById = new Map(existingRows.map((r) => [r.id, r.day_index]));

    const existingSet = new Set(existing);
    for (const id of orderedDayIds) {
      if (!existingSet.has(id)) throw new Error('reorderWorkoutPlanDays: invalid day id');
    }

    for (let i = 0; i < orderedDayIds.length; i += 1) {
      exec('UPDATE program_day SET day_index = ? WHERE id = ?', [-(i + 1), orderedDayIds[i]]);
    }

    for (let i = 0; i < orderedDayIds.length; i += 1) {
      exec("UPDATE program_day SET day_index = ?, updated_at = datetime('now') WHERE id = ?", [
        i + 1,
        orderedDayIds[i],
      ]);
    }
    for (let i = 0; i < orderedDayIds.length; i += 1) {
      const dayId = orderedDayIds[i];
      const nextIndex = i + 1;
      const prevIndex = originalIndexById.get(dayId);
      if (prevIndex === nextIndex) continue;
      enqueueProgramDaySnapshot(dayId);
    }
  });
}

export function deleteWorkoutPlan(workoutPlanId: string) {
  inTransaction(() => {
    const weekIds = query<{ id: string }>(
      `
      SELECT id
      FROM program_week
      WHERE program_id = ? AND deleted_at IS NULL;
    `,
      [workoutPlanId],
    ).map((row) => row.id);

    const dayIds = query<{ id: string }>(
      `
      SELECT d.id
      FROM program_day d
      JOIN program_week w ON w.id = d.program_week_id
      WHERE w.program_id = ? AND d.deleted_at IS NULL;
    `,
      [workoutPlanId],
    ).map((row) => row.id);

    const dayExerciseIds = query<{ id: string }>(
      `
      SELECT pde.id
      FROM program_day_exercise pde
      JOIN program_day d ON d.id = pde.program_day_id
      JOIN program_week w ON w.id = d.program_week_id
      WHERE w.program_id = ? AND pde.deleted_at IS NULL;
    `,
      [workoutPlanId],
    ).map((row) => row.id);

    const plannedSetIdsByDayExercise = new Map<string, string[]>();
    for (const dayExerciseId of dayExerciseIds) {
      const plannedSetIds = query<{ id: string }>(
        `
        SELECT id
        FROM planned_set
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
      `,
        [dayExerciseId],
      ).map((row) => row.id);
      plannedSetIdsByDayExercise.set(dayExerciseId, plannedSetIds);
    }

    exec(
      `
      UPDATE program
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [workoutPlanId],
    );

    exec(
      `
      UPDATE program_week
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_id = ? AND deleted_at IS NULL;
    `,
      [workoutPlanId],
    );

    for (const dayExerciseId of dayExerciseIds) {
      exec(
        `
        UPDATE planned_set
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
      `,
        [dayExerciseId],
      );
    }

    exec(
      `
      UPDATE program_day
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_week_id IN (
        SELECT id FROM program_week WHERE program_id = ?
      ) AND deleted_at IS NULL;
    `,
      [workoutPlanId],
    );

    exec(
      `
      UPDATE program_day_exercise
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_day_id IN (
        SELECT d.id
        FROM program_day d
        JOIN program_week w ON w.id = d.program_week_id
        WHERE w.program_id = ?
      ) AND deleted_at IS NULL;
    `,
      [workoutPlanId],
    );
    for (const dayExerciseId of dayExerciseIds) {
      const plannedSetIds = plannedSetIdsByDayExercise.get(dayExerciseId) ?? [];
      for (const plannedSetId of plannedSetIds) {
        enqueuePlannedSetSnapshot(plannedSetId, 'delete');
      }
      enqueueProgramDayExerciseSnapshot(dayExerciseId, 'delete');
    }

    for (const dayId of dayIds) {
      enqueueProgramDaySnapshot(dayId, 'delete');
    }

    for (const weekId of weekIds) {
      enqueueProgramWeekSnapshot(weekId, 'delete');
    }

    enqueueProgramSnapshot(workoutPlanId, 'delete');
  });
}

export function createWorkoutPlan(input: { name: string; description?: string | null }): string {
  const name = input.name.trim();
  if (!name) throw new Error('Workout plan name is required');

  const workoutPlanId = newId('workout_plan');

  inTransaction(() => {
    exec(
      `
      INSERT INTO program (id, name, description, is_template, owner_user_id)
      VALUES (?, ?, ?, 0, NULL);
    `,
      [workoutPlanId, name, input.description ?? null],
    );

    const weekId = getOrCreateWeek1Id(workoutPlanId);
    const dayId = addDayToWorkoutPlan(workoutPlanId);

    enqueueProgramSnapshot(workoutPlanId);
    enqueueProgramWeekSnapshot(weekId);
    enqueueProgramDaySnapshot(dayId);
  });

  return workoutPlanId;
}

export async function saveCompletedQuickWorkoutAsPlan(input: {
  sessionId: string;
  target: SaveCompletedQuickWorkoutTarget;
}): Promise<SaveCompletedQuickWorkoutResult> {
  return inTransaction(() => {
    const source = query<ReusableSessionRow>(
      `
      SELECT id, title, source_workout_plan_id, source_program_day_id
      FROM workout_session
      WHERE id = ?
        AND status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
        AND deleted_at IS NULL
      LIMIT 1;
    `,
      [input.sessionId],
    )[0];

    if (!source) {
      throw new Error('Only completed Quick Workouts can be reused.');
    }

    if (source.source_workout_plan_id !== null || source.source_program_day_id !== null) {
      throw new Error('Only completed Quick Workouts can be reused.');
    }

    let workoutPlanId: string;
    let weekId: string;
    let createdPlan = false;
    let createdWeek = false;

    if (input.target.kind === 'newPlan') {
      const name = input.target.name.trim();
      if (!name) throw new Error('Workout plan name is required');

      workoutPlanId = newId('workout_plan');
      weekId = newId('week');
      createdPlan = true;
      createdWeek = true;

      exec(
        `
        INSERT INTO program (id, name, description, is_template, owner_user_id)
        VALUES (?, ?, NULL, 0, NULL);
      `,
        [workoutPlanId, name],
      );
      exec(
        `
        INSERT INTO program_week (id, program_id, week_index)
        VALUES (?, ?, 1);
      `,
        [weekId, workoutPlanId],
      );
    } else {
      workoutPlanId = input.target.workoutPlanId;
      const plan = query<{ id: string }>(
        `
        SELECT id
        FROM program
        WHERE id = ? AND deleted_at IS NULL
        LIMIT 1;
      `,
        [workoutPlanId],
      )[0];

      if (!plan) throw new Error('Workout plan not found.');
      const week = getOrCreateWeek1(workoutPlanId);
      weekId = week.id;
      createdWeek = week.created;
    }

    const programDayId = createReusablePlanSessionDay({
      weekId,
      sessionName: source.title,
      enqueueSnapshot: false,
    });

    if (createdPlan) {
      enqueueProgramSnapshot(workoutPlanId);
      enqueueProgramWeekSnapshot(weekId);
    } else if (createdWeek) {
      enqueueProgramWeekSnapshot(weekId);
    }
    enqueueProgramDaySnapshot(programDayId);

    copyWorkoutExercisesIntoProgramDay({
      sourceSessionId: input.sessionId,
      programDayId,
    });

    return { workoutPlanId, programDayId, createdPlan };
  });
}
