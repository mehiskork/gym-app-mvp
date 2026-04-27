import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';

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

function normalizeDeletedDayIndices(programWeekId: string) {
  const deleted = query<{ id: string; day_index: number }>(
    `
    SELECT id, day_index
    FROM program_day
    WHERE program_week_id = ? AND deleted_at IS NOT NULL
    ORDER BY day_index ASC;
  `,
    [programWeekId],
  );

  for (const d of deleted) {
    const minIdx =
      query<{ min_idx: number }>(
        `
        SELECT COALESCE(MIN(day_index), 0) AS min_idx
        FROM program_day
        WHERE program_week_id = ?;
      `,
        [programWeekId],
      )[0]?.min_idx ?? 0;

    const newIdx = minIdx - 1;
    exec('UPDATE program_day SET day_index = ? WHERE id = ?', [newIdx, d.id]);
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



function enqueueProgramWeekSnapshot(
  programWeekId: string,
  opType: 'upsert' | 'delete' = 'upsert',
) {
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

    // keep deleted days far-negative so UNIQUE doesn't block
    normalizeDeletedDayIndices(weekId);

    // IMPORTANT: repair active indices back to 1..N
    compactActiveDays(weekId);

    const count =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM program_day
        WHERE program_week_id = ? AND deleted_at IS NULL;
      `,
        [weekId],
      )[0]?.n ?? 0;

    const nextIndex = count + 1;

    const dayId = newId('day');
    exec(
      `
      INSERT INTO program_day (id, program_week_id, day_index, name)
      VALUES (?, ?, ?, ?);
    `,
      [dayId, weekId, nextIndex, `Session ${nextIndex}`],
    );

    enqueueProgramDaySnapshot(dayId);

    return dayId;
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
