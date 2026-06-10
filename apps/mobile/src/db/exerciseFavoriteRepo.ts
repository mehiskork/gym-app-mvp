import { exec, query } from './db';
import { getOrCreateDeviceId } from './appMetaRepo';
import { enqueueOutboxOp } from './outboxRepo';
import { inTransaction } from './tx';

export type ExerciseFavoriteRow = {
  id: string;
  exercise_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  last_modified_by_device_id: string | null;
};

export function exerciseFavoriteId(exerciseId: string): string {
  return `exfav_${encodeURIComponent(exerciseId)}`;
}

function getFavoriteRowByExerciseId(exerciseId: string): ExerciseFavoriteRow | null {
  const row = query<ExerciseFavoriteRow>(
    `
    SELECT *
    FROM exercise_favorite
    WHERE exercise_id = ?
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  return row ?? null;
}

export function getActiveExerciseFavorite(exerciseId: string): ExerciseFavoriteRow | null {
  const row = query<ExerciseFavoriteRow>(
    `
    SELECT *
    FROM exercise_favorite
    WHERE exercise_id = ?
      AND deleted_at IS NULL
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  return row ?? null;
}

function enqueueExerciseFavoriteSnapshot(
  favoriteId: string,
  opType: 'upsert' | 'delete' = 'upsert',
) {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM exercise_favorite
    WHERE id = ?
    LIMIT 1;
  `,
    [favoriteId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'exercise_favorite',
    entityId: favoriteId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

export function setExerciseFavorite(exerciseId: string, isFavorite: boolean): boolean {
  const favoriteId = exerciseFavoriteId(exerciseId);

  return inTransaction(() => {
    const existing = getFavoriteRowByExerciseId(exerciseId);
    const currentlyFavorite = existing?.deleted_at === null;
    if (currentlyFavorite === isFavorite) {
      return currentlyFavorite;
    }

    const deviceId = getOrCreateDeviceId();

    if (isFavorite) {
      exec(
        `
        INSERT INTO exercise_favorite (
          id,
          exercise_id,
          created_at,
          updated_at,
          deleted_at,
          version,
          last_modified_by_device_id
        ) VALUES (?, ?, datetime('now'), datetime('now'), NULL, 1, ?)
        ON CONFLICT(exercise_id) DO UPDATE SET
          deleted_at = NULL,
          updated_at = datetime('now'),
          version = exercise_favorite.version + 1,
          last_modified_by_device_id = excluded.last_modified_by_device_id;
      `,
        [favoriteId, exerciseId, deviceId],
      );
      enqueueExerciseFavoriteSnapshot(favoriteId, 'upsert');
      return true;
    }

    if (!existing) return false;

    exec(
      `
      UPDATE exercise_favorite
      SET deleted_at = datetime('now'),
          updated_at = datetime('now'),
          version = version + 1,
          last_modified_by_device_id = ?
      WHERE exercise_id = ?
        AND deleted_at IS NULL;
    `,
      [deviceId, exerciseId],
    );
    enqueueExerciseFavoriteSnapshot(existing.id, 'delete');
    return false;
  });
}

export function toggleExerciseFavorite(exerciseId: string): boolean {
  return setExerciseFavorite(exerciseId, getActiveExerciseFavorite(exerciseId) === null);
}
