import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  MAX_SETS_PER_EXERCISE,
  WorkoutLimitError,
  WORKOUT_LIMIT_MESSAGES,
} from './workoutLimits';
import { EXERCISE_TYPE, type ExerciseType } from './exerciseTypes';

export type DayRow = {
  id: string;
  day_index: number;
  name: string | null;
  program_week_id: string;
};

export type DayExerciseRow = {
  id: string;
  program_day_id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_type: ExerciseType;
  position: number;
  notes: string | null;
};

export type PlannedSetRow = {
  id: string;
  program_day_exercise_id: string;
  set_index: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
};

export type PlannedSetTargetPatch = {
  reps?: number | null;
  targetWeight?: number | null;
};

function enqueueProgramDaySnapshot(dayId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program_day
    WHERE id = ?
    LIMIT 1;
  `,
    [dayId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program_day',
    entityId: dayId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

function enqueueProgramDayExerciseSnapshot(
  dayExerciseId: string,
  opType: 'upsert' | 'delete' = 'upsert',
) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM program_day_exercise
    WHERE id = ?
    LIMIT 1;
  `,
    [dayExerciseId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'program_day_exercise',
    entityId: dayExerciseId,
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

function normalizeDeletedDayIndices(programWeekId: string) {
  // Put deleted days into a far-negative "graveyard" so they never collide with temp -1..-N.
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

function isGeneratedSessionName(name: string | null | undefined): boolean {
  if (name == null) return true;
  return /^(Day|Session)\s-?\d+$/i.test(name.trim());
}

function normalizeDeletedExercisePositions(dayId: string) {
  // Put deleted exercises into a far-negative "graveyard" so they never collide with temp -1..-N.
  const deleted = query<{ id: string }>(
    `
    SELECT id
    FROM program_day_exercise
    WHERE program_day_id = ? AND deleted_at IS NOT NULL
    ORDER BY position ASC;
  `,
    [dayId],
  );

  if (deleted.length === 0) return;

  const minPos =
    query<{ min_pos: number }>(
      `
      SELECT COALESCE(MIN(position), 0) AS min_pos
      FROM program_day_exercise
      WHERE program_day_id = ?;
    `,
      [dayId],
    )[0]?.min_pos ?? 0;

  const base = minPos - 1000;

  for (let i = 0; i < deleted.length; i += 1) {
    exec('UPDATE program_day_exercise SET position = ? WHERE id = ?', [
      base - (i + 1),
      deleted[i].id,
    ]);
  }
}

function normalizeDeletedPlannedSetIndices(dayExerciseId: string): string[] {
  const deleted = query<{ id: string }>(
    `
    SELECT id
    FROM planned_set
    WHERE program_day_exercise_id = ? AND deleted_at IS NOT NULL
    ORDER BY set_index ASC;
  `,
    [dayExerciseId],
  );

  if (deleted.length === 0) return [];

  const minIdx =
    query<{ min_idx: number }>(
      `
      SELECT COALESCE(MIN(set_index), 0) AS min_idx
      FROM planned_set
      WHERE program_day_exercise_id = ?;
    `,
      [dayExerciseId],
    )[0]?.min_idx ?? 0;

  const base = minIdx - 1000;

  for (let i = 0; i < deleted.length; i += 1) {
    exec('UPDATE planned_set SET set_index = ? WHERE id = ?', [base - (i + 1), deleted[i].id]);
  }

  return deleted.map((row) => row.id);
}

function compactActivePlannedSets(dayExerciseId: string): string[] {
  normalizeDeletedPlannedSetIndices(dayExerciseId);

  const active = query<{ id: string; set_index: number }>(
    `
    SELECT id, set_index
    FROM planned_set
    WHERE program_day_exercise_id = ? AND deleted_at IS NULL
    ORDER BY set_index ASC;
  `,
    [dayExerciseId],
  );

  const changedIds: string[] = [];
  for (let i = 0; i < active.length; i += 1) {
    exec('UPDATE planned_set SET set_index = ? WHERE id = ?', [-(i + 1), active[i].id]);
  }

  for (let i = 0; i < active.length; i += 1) {
    const nextIndex = i + 1;
    const row = active[i];
    if (row.set_index === nextIndex) {
      exec('UPDATE planned_set SET set_index = ? WHERE id = ?', [nextIndex, row.id]);
      continue;
    }

    exec(
      `
      UPDATE planned_set
      SET set_index = ?, updated_at = datetime('now')
      WHERE id = ?;
    `,
      [nextIndex, row.id],
    );
    changedIds.push(row.id);
  }

  return changedIds;
}

function isValidRepsValue(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 999);
}

function hasAtMostOneDecimalPlace(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function isValidTargetWeightValue(value: number | null): boolean {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 999.9 &&
      hasAtMostOneDecimalPlace(value))
  );
}

function getExerciseType(exerciseId: string): ExerciseType {
  const row = query<{ exercise_type: ExerciseType }>(
    `
    SELECT exercise_type
    FROM exercise
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  if (!row) throw new Error('exercise not found');
  return row.exercise_type;
}

export function getDayById(dayId: string): DayRow | null {
  const rows = query<DayRow>(
    `
    SELECT id, day_index, name, program_week_id
    FROM program_day
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
    [dayId],
  );
  return rows[0] ?? null;
}

export function renameDay(dayId: string, name: string | null) {
  inTransaction(() => {
    exec(
      `
      UPDATE program_day
      SET name = ?, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [name, dayId],
    );

    enqueueProgramDaySnapshot(dayId);
  });
}

export function listDayExercises(dayId: string): DayExerciseRow[] {
  return query<DayExerciseRow>(
    `
    SELECT
      pde.id,
      pde.program_day_id,
      pde.exercise_id,
      e.name AS exercise_name,
      e.exercise_type AS exercise_type,
      pde.position,
      pde.notes
    FROM program_day_exercise pde
    JOIN exercise e ON e.id = pde.exercise_id
    WHERE pde.program_day_id = ? AND pde.deleted_at IS NULL
    ORDER BY pde.position ASC;
    `,
    [dayId],
  );
}

export function listPlannedSetsForDayExercise(dayExerciseId: string): PlannedSetRow[] {
  return query<PlannedSetRow>(
    `
    SELECT
      id,
      program_day_exercise_id,
      set_index,
      target_reps_min,
      target_reps_max,
      target_weight
    FROM planned_set
    WHERE program_day_exercise_id = ? AND deleted_at IS NULL
    ORDER BY set_index ASC;
  `,
    [dayExerciseId],
  );
}

export function addExerciseToDay(input: { dayId: string; exerciseId: string }): string {
  const { dayId, exerciseId } = input;

  return inTransaction(() => {
    normalizeDeletedExercisePositions(dayId);

    const count =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM program_day_exercise
        WHERE program_day_id = ? AND deleted_at IS NULL;
      `,
        [dayId],
      )[0]?.n ?? 0;

    if (count >= MAX_EXERCISES_PER_SESSION) {
      throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    }

    const nextPos =
      query<{ next_pos: number }>(
        `
        SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
        FROM program_day_exercise
        WHERE program_day_id = ? AND deleted_at IS NULL;
      `,
        [dayId],
      )[0]?.next_pos ?? 1;

    const id = newId('day_ex');
    const exerciseType = getExerciseType(exerciseId);
    let plannedSetId: string | null = null;

    exec(
      `
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
      VALUES (?, ?, ?, ?, NULL);
    `,
      [id, dayId, exerciseId, nextPos],
    );

    if (exerciseType === EXERCISE_TYPE.STRENGTH) {
      plannedSetId = newId('pset');
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
        ) VALUES (?, ?, 1, 0, 0, NULL, 0, NULL);
      `,
        [plannedSetId, id],
      );
    }

    enqueueProgramDayExerciseSnapshot(id);
    if (plannedSetId) enqueuePlannedSetSnapshot(plannedSetId);

    return id;
  });
}

export function addPlannedSetToDayExercise(dayExerciseId: string): string {
  return inTransaction(() => {
    compactActivePlannedSets(dayExerciseId);

    const count =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM planned_set
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
      `,
        [dayExerciseId],
      )[0]?.n ?? 0;

    if (count >= MAX_SETS_PER_EXERCISE) {
      throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxSetsPerExercise);
    }

    const previous = query<
      Pick<PlannedSetRow, 'target_reps_min' | 'target_reps_max' | 'target_weight'>
    >(
      `
      SELECT target_reps_min, target_reps_max, target_weight
      FROM planned_set
      WHERE program_day_exercise_id = ? AND deleted_at IS NULL
      ORDER BY set_index DESC
      LIMIT 1;
    `,
      [dayExerciseId],
    )[0];

    const plannedSetId = newId('pset');
    const nextIndex = count + 1;
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
      [
        plannedSetId,
        dayExerciseId,
        nextIndex,
        previous ? previous.target_reps_min : 0,
        previous ? previous.target_reps_max : 0,
        previous ? previous.target_weight : 0,
      ],
    );

    enqueuePlannedSetSnapshot(plannedSetId);
    return plannedSetId;
  });
}

export function updatePlannedSetTargets(plannedSetId: string, patch: PlannedSetTargetPatch) {
  const updates: Array<[string, number | null]> = [];

  if (Object.prototype.hasOwnProperty.call(patch, 'reps')) {
    if (!isValidRepsValue(patch.reps ?? null)) return;
    updates.push(['target_reps_min', patch.reps ?? null]);
    updates.push(['target_reps_max', patch.reps ?? null]);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'targetWeight')) {
    if (!isValidTargetWeightValue(patch.targetWeight ?? null)) return;
    updates.push(['target_weight', patch.targetWeight ?? null]);
  }

  if (updates.length === 0) return;

  const cols = updates.map(([key]) => `${key} = ?`).join(', ');
  const params = updates.map(([, value]) => value);

  inTransaction(() => {
    exec(
      `
      UPDATE planned_set
      SET ${cols}, updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [...params, plannedSetId],
    );

    enqueuePlannedSetSnapshot(plannedSetId);
  });
}

export function deletePlannedSet(plannedSetId: string): boolean {
  return inTransaction(() => {
    const row = query<{ program_day_exercise_id: string }>(
      `
      SELECT program_day_exercise_id
      FROM planned_set
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [plannedSetId],
    )[0];

    if (!row) return false;

    const activeCount =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM planned_set
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
      `,
        [row.program_day_exercise_id],
      )[0]?.n ?? 0;

    if (activeCount <= 1) return false;

    normalizeDeletedPlannedSetIndices(row.program_day_exercise_id);

    const minIdx =
      query<{ min_idx: number }>(
        `
        SELECT COALESCE(MIN(set_index), 0) AS min_idx
        FROM planned_set
        WHERE program_day_exercise_id = ?;
      `,
        [row.program_day_exercise_id],
      )[0]?.min_idx ?? 0;

    exec(
      `
      UPDATE planned_set
      SET set_index = ?, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [minIdx - 1, plannedSetId],
    );

    enqueuePlannedSetSnapshot(plannedSetId, 'delete');

    const changedIds = compactActivePlannedSets(row.program_day_exercise_id);
    for (const changedId of changedIds) {
      enqueuePlannedSetSnapshot(changedId);
    }

    return true;
  });
}

export function reorderDayExercises(dayId: string, orderedDayExerciseIds: string[]) {
  inTransaction(() => {
    normalizeDeletedExercisePositions(dayId);

    const existingRows = query<{ id: string; position: number }>(
      `
      SELECT id, position
      FROM program_day_exercise
      WHERE program_day_id = ? AND deleted_at IS NULL;
    `,
      [dayId],
    );

    const existing = existingRows.map((r) => r.id);
    const originalPositionById = new Map(existingRows.map((r) => [r.id, r.position]));

    const existingSet = new Set(existing);
    for (const id of orderedDayExerciseIds) {
      if (!existingSet.has(id)) throw new Error('reorderDayExercises: invalid item id');
    }

    // Temp negative positions (safe because deleted are far more negative)
    for (let i = 0; i < orderedDayExerciseIds.length; i += 1) {
      exec('UPDATE program_day_exercise SET position = ? WHERE id = ?', [
        -(i + 1),
        orderedDayExerciseIds[i],
      ]);
    }

    // Final 1..N
    for (let i = 0; i < orderedDayExerciseIds.length; i += 1) {
      exec(
        "UPDATE program_day_exercise SET position = ?, updated_at = datetime('now') WHERE id = ?",
        [i + 1, orderedDayExerciseIds[i]],
      );
    }

    for (let i = 0; i < orderedDayExerciseIds.length; i += 1) {
      const dayExerciseId = orderedDayExerciseIds[i];
      const nextPosition = i + 1;
      const prevPosition = originalPositionById.get(dayExerciseId);
      if (prevPosition === nextPosition) continue;
      enqueueProgramDayExerciseSnapshot(dayExerciseId);
    }
  });
}

export function deleteDayExercise(dayExerciseId: string) {
  inTransaction(() => {
    const row = query<{ program_day_id: string; exercise_name: string }>(
      `
      SELECT pde.program_day_id AS program_day_id, e.name AS exercise_name
      FROM program_day_exercise pde
      JOIN exercise e ON e.id = pde.exercise_id
      WHERE pde.id = ? AND pde.deleted_at IS NULL
      LIMIT 1;
    `,
      [dayExerciseId],
    )[0];

    if (!row) throw new Error('deleteDayExercise: item not found');

    const dayId = row.program_day_id;

    const plannedSetIds = query<{ id: string }>(
      `
      SELECT id
      FROM planned_set
      WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
    `,
      [dayExerciseId],
    ).map((entry) => entry.id);

    normalizeDeletedExercisePositions(dayId);

    exec(
      `
      UPDATE planned_set
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
    `,
      [dayExerciseId],
    );

    // Move this row below the current minimum so it cannot collide with any temp negatives
    const minPos =
      query<{ min_pos: number }>(
        `
        SELECT COALESCE(MIN(position), 0) AS min_pos
        FROM program_day_exercise
        WHERE program_day_id = ?;
      `,
        [dayId],
      )[0]?.min_pos ?? 0;

    exec(
      `
      UPDATE program_day_exercise
      SET position = ?, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [minPos - 1, dayExerciseId],
    );

    // Compact remaining ACTIVE exercises to 1..N (safe now)
    const remaining = query<{ id: string }>(
      `
      SELECT id
      FROM program_day_exercise
      WHERE program_day_id = ? AND deleted_at IS NULL
      ORDER BY position ASC;
    `,
      [dayId],
    );

    for (let i = 0; i < remaining.length; i += 1) {
      exec('UPDATE program_day_exercise SET position = ? WHERE id = ?', [
        -(i + 1),
        remaining[i].id,
      ]);
    }

    for (let i = 0; i < remaining.length; i += 1) {
      exec(
        "UPDATE program_day_exercise SET position = ?, updated_at = datetime('now') WHERE id = ?",
        [i + 1, remaining[i].id],
      );
    }

    for (const plannedSetId of plannedSetIds) {
      enqueuePlannedSetSnapshot(plannedSetId, 'delete');
    }

    enqueueProgramDayExerciseSnapshot(dayExerciseId, 'delete');
  });
}

export function deleteDay(dayId: string) {
  inTransaction(() => {
    const row = query<{ program_week_id: string }>(
      `
      SELECT program_week_id
      FROM program_day
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [dayId],
    )[0];

    if (!row) throw new Error('deleteDay: day not found');

    const dayExerciseIds = query<{ id: string }>(
      `
      SELECT id
      FROM program_day_exercise
      WHERE program_day_id = ? AND deleted_at IS NULL;
    `,
      [dayId],
    ).map((entry) => entry.id);

    const plannedSetIdsByDayExercise = new Map<string, string[]>();
    for (const dayExerciseId of dayExerciseIds) {
      const plannedSetIds = query<{ id: string }>(
        `
        SELECT id
        FROM planned_set
        WHERE program_day_exercise_id = ? AND deleted_at IS NULL;
      `,
        [dayExerciseId],
      ).map((entry) => entry.id);
      plannedSetIdsByDayExercise.set(dayExerciseId, plannedSetIds);
    }

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

    normalizeDeletedDayIndices(row.program_week_id);

    exec(
      `
      UPDATE program_day_exercise
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_day_id = ? AND deleted_at IS NULL;
    `,
      [dayId],
    );

    const minIdx =
      query<{ min_idx: number }>(
        `
        SELECT COALESCE(MIN(day_index), 0) AS min_idx
        FROM program_day
        WHERE program_week_id = ?;
      `,
        [row.program_week_id],
      )[0]?.min_idx ?? 0;

    exec(
      `
      UPDATE program_day
      SET day_index = ?, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [minIdx - 1, dayId],
    );

    const remaining = query<{ id: string; name: string | null }>(
      `
      SELECT id, name
      FROM program_day
      WHERE program_week_id = ? AND deleted_at IS NULL
      ORDER BY day_index ASC;
    `,
      [row.program_week_id],
    );

    for (let i = 0; i < remaining.length; i += 1) {
      exec('UPDATE program_day SET day_index = ? WHERE id = ?', [-(i + 1), remaining[i].id]);
    }

    for (let i = 0; i < remaining.length; i += 1) {
      const nextIndex = i + 1;
      if (isGeneratedSessionName(remaining[i].name)) {
        exec(
          "UPDATE program_day SET day_index = ?, name = ?, updated_at = datetime('now') WHERE id = ?",
          [nextIndex, `Session ${nextIndex}`, remaining[i].id],
        );
      } else {
        exec("UPDATE program_day SET day_index = ?, updated_at = datetime('now') WHERE id = ?", [
          nextIndex,
          remaining[i].id,
        ]);
      }
    }
    for (const dayExerciseId of dayExerciseIds) {
      const plannedSetIds = plannedSetIdsByDayExercise.get(dayExerciseId) ?? [];

      for (const plannedSetId of plannedSetIds) {
        enqueuePlannedSetSnapshot(plannedSetId, 'delete');
      }

      enqueueProgramDayExerciseSnapshot(dayExerciseId, 'delete');
    }

    enqueueProgramDaySnapshot(dayId, 'delete');

    for (const day of remaining) {
      enqueueProgramDaySnapshot(day.id);
    }
  });
}
