import { inTransaction } from './tx';

import curatedJson from './seed/curated_exercises.json';
import { exec } from './db';

type CuratedExercise = {
  id: string;
  name: string;
  equipment?: string | null;
  primary_muscle?: string | null;
  notes?: string | null;
};

// Force the JSON to the shape we expect
const curated = curatedJson as CuratedExercise[];

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

// Curated seeding upserts curated entries so app updates can refresh metadata.
// User edits should not override curated entries; curated rows are treated as source-of-truth.

export function seedCuratedExercises() {
  inTransaction(() => {
    for (const ex of curated) {
      // Insert missing rows
      exec(
        `
        INSERT OR IGNORE INTO exercise (
          id, name, normalized_name, is_custom, owner_user_id,
          equipment, primary_muscle, notes
        ) VALUES (?, ?, ?, 0, NULL, ?, ?, ?);
      `,
        [
          ex.id,
          ex.name.trim(),
          normalizeName(ex.name),
          ex.equipment ?? null,
          ex.primary_muscle ?? null,
          ex.notes ?? null,
        ],
      );

      // Optional: keep curated rows updated if you change names/fields later
      exec(
        `
        UPDATE exercise
        SET
          name = ?,
          normalized_name = ?,
          equipment = ?,
          primary_muscle = ?,
          notes = ?,
          updated_at = datetime('now')
        WHERE id = ? AND is_custom = 0 AND deleted_at IS NULL;
      `,
        [
          ex.name.trim(),
          normalizeName(ex.name),
          ex.equipment ?? null,
          ex.primary_muscle ?? null,
          ex.notes ?? null,
          ex.id,
        ],
      );
    }
  });
}
