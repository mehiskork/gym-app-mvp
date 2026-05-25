import { exec, query } from './db';
import { newId } from '../utils/ids';
import { getClaimedUserId, getOrCreateLocalUserId } from './appMetaRepo';
import { inTransaction } from './tx';
import { EXERCISE_TYPE, type CardioProfile, type ExerciseType } from './exerciseTypes';
import { enqueueOutboxOp } from './outboxRepo';

export type ExerciseRow = {
  id: string;
  name: string;
  normalized_name: string;
  is_custom: number;
  owner_user_id: string | null;
  exercise_type: ExerciseType;
  cardio_profile: CardioProfile | null;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function getCurrentExerciseOwnerUserId(): string {
  return getClaimedUserId() ?? getOrCreateLocalUserId();
}

function enqueueExerciseSnapshot(exerciseId: string, opType: 'upsert' | 'delete' = 'upsert') {
  const row = query<Record<string, unknown>>(
    `
    SELECT *
    FROM exercise
    WHERE id = ?
    LIMIT 1;
  `,
    [exerciseId],
  )[0];

  if (!row) return;

  enqueueOutboxOp({
    entityType: 'exercise',
    entityId: exerciseId,
    opType,
    payloadJson: JSON.stringify(row),
  });
}

export function listExercises(ownerUserId: string): ExerciseRow[] {
  return query<ExerciseRow>(
    `
    SELECT id, name, normalized_name, is_custom, owner_user_id, exercise_type, cardio_profile
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
  const ownerUserId = getCurrentExerciseOwnerUserId();

  inTransaction(() => {
    exec(
      `
      INSERT INTO exercise (
        id, name, normalized_name, is_custom, owner_user_id
          , exercise_type, cardio_profile
      ) VALUES (?, ?, ?, 1, ?, ?, NULL);
    `,
      [id, trimmed, normalizeName(trimmed), ownerUserId, EXERCISE_TYPE.STRENGTH],
    );

    enqueueExerciseSnapshot(id);
  });

  return id;
}

export function listExercisesForCurrentUser(): ExerciseRow[] {
  return listExercises(getCurrentExerciseOwnerUserId());
}

export async function rewriteCustomExerciseOwnerAfterAccountClaim(
  fromOwnerUserId: string,
  toOwnerUserId: string,
): Promise<number> {
  const fromOwner = fromOwnerUserId.trim();
  const toOwner = toOwnerUserId.trim();
  if (!fromOwner || !toOwner || fromOwner === toOwner) return 0;

  return inTransaction(() => {
    const rows = query<{ id: string; deleted_at: string | null }>(
      `
      SELECT id, deleted_at
      FROM exercise
      WHERE is_custom = 1
        AND owner_user_id = ?;
    `,
      [fromOwner],
    );

    if (rows.length === 0) return 0;

    const exerciseIds = rows.map((row) => row.id);
    const placeholders = exerciseIds.map(() => '?').join(', ');

    exec(
      `
      UPDATE exercise
      SET owner_user_id = ?, updated_at = datetime('now')
      WHERE is_custom = 1
        AND owner_user_id = ?
        AND id IN (${placeholders});
    `,
      [toOwner, fromOwner, ...exerciseIds],
    );

    for (const row of rows) {
      enqueueExerciseSnapshot(row.id, row.deleted_at !== null ? 'delete' : 'upsert');
    }

    return rows.length;
  });
}

export function claimLegacyCustomExercisesForDevice(ownerUserId: string): number {
  return inTransaction(() => {
    const before =
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM exercise
        WHERE is_custom = 1
          AND owner_user_id IS NULL
          AND deleted_at IS NULL;
      `,
      )[0]?.n ?? 0;

    if (before === 0) return 0;

    exec(
      `
      UPDATE exercise
      SET owner_user_id = ?, updated_at = datetime('now')
      WHERE is_custom = 1
        AND owner_user_id IS NULL
        AND deleted_at IS NULL;
    `,
      [ownerUserId],
    );

    return before;
  });
}
