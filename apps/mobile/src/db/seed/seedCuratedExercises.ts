import curated from './curated_exercises.json';
import { exec } from '../db';

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

type CuratedExercise = { id: string; name: string };

export function seedCuratedExercises() {
  // Insert curated exercises if not present. Idempotent.
  for (const ex of curated as CuratedExercise[]) {
    exec(
      `
      INSERT OR IGNORE INTO exercise (
        id, name, normalized_name, is_custom, owner_user_id
      ) VALUES (?, ?, ?, 0, NULL);
    `,
      [ex.id, ex.name, normalizeName(ex.name)],
    );
  }
}
