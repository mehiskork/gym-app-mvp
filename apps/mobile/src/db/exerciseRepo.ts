import { exec, query } from './db';
import { newId } from '../utils/ids';
import { getOrCreateLocalUserId } from './appMetaRepo';

export type ExerciseRow = {
  id: string;
  name: string;
  normalized_name: string;
  is_custom: number;
  owner_user_id: string | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function listExercises(ownerUserId: string): ExerciseRow[] {
  return query<ExerciseRow>(
    `
    SELECT id, name, normalized_name, is_custom, owner_user_id
    FROM exercise
    WHERE deleted_at IS NULL
      AND (
        is_custom = 0
        OR owner_user_id = ?
      )
    ORDER BY is_custom ASC, name ASC;
  `,
    [ownerUserId],
  );
}

export function createCustomExercise(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Exercise name is required');

  const id = newId('ex_custom');
  const ownerUserId = getOrCreateLocalUserId();

  exec(
    `
    INSERT INTO exercise (
      id, name, normalized_name, is_custom, owner_user_id
    ) VALUES (?, ?, ?, 1, ?);
  `,
    [id, trimmed, normalizeName(trimmed), ownerUserId],
  );

  return id;
}

export function listExercisesForCurrentUser(): ExerciseRow[] {
  return listExercises(getOrCreateLocalUserId());
}
