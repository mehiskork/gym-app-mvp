import { exec, query } from '../db';
import { inTransaction } from '../tx';
import { newId } from '../../utils/ids';

export function seedTestPlan(): void {
  inTransaction(() => {
    const existing = query<{ id: string }>(
      `
      SELECT id
      FROM program
      WHERE name = ? AND deleted_at IS NULL
      LIMIT 1;
    `,
      ['Demo Program'],
    )[0];

    if (existing) return;

    const programId = newId('program');
    exec(`INSERT INTO program (id, name) VALUES (?, ?)`, [programId, 'Demo Program']);

    const weekId = newId('week');
    exec(`INSERT INTO program_week (id, program_id, week_index) VALUES (?, ?, ?)`, [
      weekId,
      programId,
      1,
    ]);

    const dayId = newId('day');
    exec(`INSERT INTO program_day (id, program_week_id, name, day_index) VALUES (?, ?, ?, ?)`, [
      dayId,
      weekId,
      'Day 1',
      1,
    ]);

    const exercises = query<{ id: string }>(
      `
      SELECT id
      FROM exercise
      WHERE deleted_at IS NULL
      ORDER BY id
      LIMIT 5;
    `,
    );

    exercises.forEach((ex, index) => {
      exec(
        `
        INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
        VALUES (?, ?, ?, ?, ?);
      `,
        [newId('pde'), dayId, ex.id, index + 1, null],
      );
    });
  });
}
