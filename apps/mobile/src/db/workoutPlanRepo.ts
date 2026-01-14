import { exec, query } from './db';
import { newId } from '../utils/ids';

export type WorkoutPlanRow = {
  id: string;
  name: string;
  description: string | null;
  is_template: number;
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

export function createWorkoutPlan(input: { name: string; description?: string | null }): string {
  const name = input.name.trim();
  if (!name) throw new Error('Workout plan name is required');

  const id = newId('workout_plan');

  exec(
    `
    INSERT INTO program (id, name, description, is_template, owner_user_id)
    VALUES (?, ?, ?, 0, NULL);
  `,
    [id, name, input.description ?? null],
  );

  return id;
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
