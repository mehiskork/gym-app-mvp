import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';

export type WorkoutPlanRow = {
  id: string;
  name: string;
  description: string | null;
  is_template: number;
};

export type WorkoutPlanWeekRow = {
  id: string;
  week_index: number;
};

export type WorkoutPlanDayRow = {
  id: string;
  day_index: number;
  name: string | null;
};

// NOTE: DB table is still named "program" for now.
// We map it to the "WorkoutPlan" domain in code.
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

export function listWeeksForWorkoutPlan(workoutPlanId: string): WorkoutPlanWeekRow[] {
  return query<WorkoutPlanWeekRow>(
    `
    SELECT id, week_index
    FROM program_week
    WHERE program_id = ? AND deleted_at IS NULL
    ORDER BY week_index ASC;
  `,
    [workoutPlanId],
  );
}

export function listDaysForWeek(weekId: string): WorkoutPlanDayRow[] {
  return query<WorkoutPlanDayRow>(
    `
    SELECT id, day_index, name
    FROM program_day
    WHERE program_week_id = ? AND deleted_at IS NULL
    ORDER BY day_index ASC;
  `,
    [weekId],
  );
}

// For older plans created before we added default week/day creation,
// this can generate Week 1 + Day 1..7 if missing.
export function ensureDefaultWeekAndDays(workoutPlanId: string) {
  inTransaction(() => {
    const existingWeek = query<{ id: string }>(
      `
      SELECT id
      FROM program_week
      WHERE program_id = ? AND week_index = 1 AND deleted_at IS NULL
      LIMIT 1;
    `,
      [workoutPlanId],
    )[0];

    const weekId = existingWeek?.id ?? newId('week');

    if (!existingWeek) {
      exec(
        `
        INSERT INTO program_week (id, program_id, week_index)
        VALUES (?, ?, 1);
      `,
        [weekId, workoutPlanId],
      );
    }

    for (let i = 1; i <= 7; i += 1) {
      const existingDay = query<{ id: string }>(
        `
        SELECT id
        FROM program_day
        WHERE program_week_id = ? AND day_index = ? AND deleted_at IS NULL
        LIMIT 1;
      `,
        [weekId, i],
      )[0];

      if (!existingDay) {
        exec(
          `
          INSERT INTO program_day (id, program_week_id, day_index, name)
          VALUES (?, ?, ?, ?);
        `,
          [newId('day'), weekId, i, `Day ${i}`],
        );
      }
    }
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

    // Default structure: Week 1 + Days 1..7
    const weekId = newId('week');
    exec(
      `
      INSERT INTO program_week (id, program_id, week_index)
      VALUES (?, ?, 1);
    `,
      [weekId, workoutPlanId],
    );

    for (let i = 1; i <= 7; i += 1) {
      exec(
        `
        INSERT INTO program_day (id, program_week_id, day_index, name)
        VALUES (?, ?, ?, ?);
      `,
        [newId('day'), weekId, i, `Day ${i}`],
      );
    }
  });

  return workoutPlanId;
}
