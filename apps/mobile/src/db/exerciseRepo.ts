import { exec, query } from './db';
import { newId } from '../utils/ids';

export type ExerciseRow = {
  id: string;
  name: string;
  is_custom: number;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function listExercises(): ExerciseRow[] {
  return query<ExerciseRow>(
    `
    SELECT id, name, is_custom
    FROM exercise
    WHERE deleted_at IS NULL
    ORDER BY name ASC
    LIMIT 200;
  `,
  );
}

export function createCustomExercise(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Exercise name is required');

  const id = newId('ex_custom');

  exec(
    `
    INSERT INTO exercise (
      id, name, normalized_name, is_custom, owner_user_id
    ) VALUES (?, ?, ?, 1, NULL);
  `,
    [id, trimmed, normalizeName(trimmed)],
  );

  return id;
}
