import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';

export type DayRow = {
  id: string;
  day_index: number;
  name: string | null;
  program_week_id: string;
};

export type DayExerciseRow = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
};

function normalizeDeletedDayIndices(programWeekId: string) {
  // Move deleted rows out of the positive day_index range so UNIQUE(program_week_id, day_index) won’t block.
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
    // Ensure the deleted row has a unique negative index.
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

export function renameDay(dayId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Day name is required');

  exec(
    `
    UPDATE program_day
    SET name = ?, updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL;
  `,
    [trimmed, dayId],
  );
}

export function listDayExercises(dayId: string): DayExerciseRow[] {
  return query<DayExerciseRow>(
    `
    SELECT
      pde.id,
      pde.exercise_id,
      e.name AS exercise_name,
      pde.position
    FROM program_day_exercise pde
    JOIN exercise e ON e.id = pde.exercise_id
    WHERE pde.program_day_id = ?
      AND pde.deleted_at IS NULL
      AND e.deleted_at IS NULL
    ORDER BY pde.position ASC;
  `,
    [dayId],
  );
}

export function addExerciseToDay(input: { dayId: string; exerciseId: string }): string {
  const { dayId, exerciseId } = input;

  return inTransaction(() => {
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

    for (let i = 0; i < orderedDayExerciseIds.length; i += 1) {
      exec('UPDATE program_day_exercise SET position = ? WHERE id = ?', [
        -(i + 1),
        orderedDayExerciseIds[i],
      ]);
    }

    for (let i = 0; i < orderedDayExerciseIds.length; i += 1) {
      exec(
        "UPDATE program_day_exercise SET position = ?, updated_at = datetime('now') WHERE id = ?",
        [i + 1, orderedDayExerciseIds[i]],
      );
    }
  });
}

export function deleteDay(dayId: string) {
  inTransaction(() => {
    const row = query<{ program_week_id: string; day_index: number }>(
      `
      SELECT program_week_id, day_index
      FROM program_day
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      [dayId],
    )[0];

    if (!row) throw new Error('deleteDay: day not found');

    // 1) Normalize existing deleted rows first (fixes old data too)
    normalizeDeletedDayIndices(row.program_week_id);

    // 2) Soft-delete day exercises
    exec(
      `
      UPDATE program_day_exercise
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE program_day_id = ? AND deleted_at IS NULL;
    `,
      [dayId],
    );

    // 3) Move THIS day to a unique negative index and soft-delete it
    const minIdx =
      query<{ min_idx: number }>(
        `
        SELECT COALESCE(MIN(day_index), 0) AS min_idx
        FROM program_day
        WHERE program_week_id = ?;
      `,
        [row.program_week_id],
      )[0]?.min_idx ?? 0;

    const deletedIdx = minIdx - 1;

    exec(
      `
      UPDATE program_day
      SET day_index = ?, deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL;
    `,
      [deletedIdx, dayId],
    );

    // 4) Compact remaining ACTIVE days to 1..N (safe now)
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
