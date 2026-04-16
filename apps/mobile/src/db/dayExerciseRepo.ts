import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { enqueueOutboxOp } from './outboxRepo';

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
  position: number;
  notes: string | null;
};

function enqueueProgramDaySnapshot(dayId: string) {
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
    opType: 'upsert',
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
  pde.exercise_id,         --
  e.name AS exercise_name,
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

export function addExerciseToDay(input: { dayId: string; exerciseId: string }): string {
  const { dayId, exerciseId } = input;

  return inTransaction(() => {
    normalizeDeletedExercisePositions(dayId);

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

    exec(
      `
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
      VALUES (?, ?, ?, ?, NULL);
    `,
      [id, dayId, exerciseId, nextPos],
    );

    return id;
  });
}

export function reorderDayExercises(dayId: string, orderedDayExerciseIds: string[]) {
  inTransaction(() => {
    normalizeDeletedExercisePositions(dayId);

    const existing = query<{ id: string }>(
      `
      SELECT id
      FROM program_day_exercise
      WHERE program_day_id = ? AND deleted_at IS NULL;
    `,
      [dayId],
    ).map((r) => r.id);

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

    normalizeDeletedExercisePositions(dayId);

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

    const remaining = query<{ id: string }>(
      `
      SELECT id
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
      exec("UPDATE program_day SET day_index = ?, updated_at = datetime('now') WHERE id = ?", [
        i + 1,
        remaining[i].id,
      ]);
    }
  });
}
