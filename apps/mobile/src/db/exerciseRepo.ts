import { query } from './db';

export type ExerciseRow = {
  id: string;
  name: string;
  is_custom: number;
};

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
