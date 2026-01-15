import { exec, query } from './db';
import { newId } from '../utils/ids';

export function getMeta(key: string): string | null {
  const row = query<{ value: string }>(
    `
    SELECT value
    FROM app_meta
    WHERE key = ?
    LIMIT 1;
  `,
    [key],
  )[0];
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  exec(
    `
    INSERT INTO app_meta (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now');
  `,
    [key, value],
  );
}

/**
 * Device-local user id, used as owner_user_id for custom exercises until sign-in exists.
 */
export function getOrCreateLocalUserId(): string {
  const existing = getMeta('local_user_id');
  if (existing) return existing;

  const id = newId('usr'); // e.g. usr_xxx
  setMeta('local_user_id', id);
  return id;
}

/**
 * Safety: older custom exercises might have owner_user_id NULL.
 * Claim them for this device so they remain visible.
 */
export function claimLegacyCustomExercisesForDevice(localUserId: string) {
  exec(
    `
    UPDATE exercise
    SET owner_user_id = ?, updated_at = datetime('now')
    WHERE is_custom = 1
      AND owner_user_id IS NULL
      AND deleted_at IS NULL;
  `,
    [localUserId],
  );
}
