import { exec, query } from './db';
import { newId } from '../utils/ids';
import { safeJsonParse } from '../utils/json';

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

export type SyncAckSummary = {
  applied: number;
  noop: number;
  rejected: number;
};

export function setLastSyncAckSummary(summary: SyncAckSummary) {
  setMeta('last_sync_ack_summary', JSON.stringify(summary));
}

export function getLastSyncAckSummary(): SyncAckSummary | null {
  const raw = getMeta('last_sync_ack_summary');
  if (!raw) return null;
  const parsed = safeJsonParse(raw) as Partial<SyncAckSummary> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    applied: typeof parsed.applied === 'number' ? parsed.applied : 0,
    noop: typeof parsed.noop === 'number' ? parsed.noop : 0,
    rejected: typeof parsed.rejected === 'number' ? parsed.rejected : 0,
  };
}

function clearMeta(key: string) {
  exec(
    `
    DELETE FROM app_meta
    WHERE key = ?;
  `,
    [key],
  );
}

export type SyncPauseReason = 'claim';

const SYNC_PAUSED_REASON_KEY = 'sync_paused_reason';
const CLAIMED_KEY = 'claimed';
const CLAIMED_USER_ID_KEY = 'claimed_user_id';
const REST_TIMER_NOTIFICATION_ID_KEY = 'rest_timer_notification_id';

export function pauseSync(reason: SyncPauseReason) {
  setMeta(SYNC_PAUSED_REASON_KEY, reason);
}

export function resumeSync() {
  clearMeta(SYNC_PAUSED_REASON_KEY);
}

export function isSyncPaused(): boolean {
  return getMeta(SYNC_PAUSED_REASON_KEY) !== null;
}

export function setClaimed(value: boolean) {
  setMeta(CLAIMED_KEY, value ? '1' : '0');
}

export function getClaimed(): boolean {
  return getMeta(CLAIMED_KEY) === '1';
}

export function setClaimedUserId(userId: string | null) {
  if (!userId) {
    clearMeta(CLAIMED_USER_ID_KEY);
    return;
  }

  setMeta(CLAIMED_USER_ID_KEY, userId);
}

export function getClaimedUserId(): string | null {
  return getMeta(CLAIMED_USER_ID_KEY);
}

export async function getRestTimerNotificationId(): Promise<string | null> {
  return getMeta(REST_TIMER_NOTIFICATION_ID_KEY);
}

export async function setRestTimerNotificationId(id: string | null): Promise<void> {
  if (!id) {
    clearMeta(REST_TIMER_NOTIFICATION_ID_KEY);
    return;
  }

  setMeta(REST_TIMER_NOTIFICATION_ID_KEY, id);
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

export function getOrCreateDeviceId(): string {
  const existing = getMeta('device_id');
  if (existing) return existing;

  const id = newId('dev');
  setMeta('device_id', id);
  return id;
}

export function getGuestUserId(): string | null {
  return getMeta('guest_user_id');
}

/**
 * Canonical user identity for sync attribution until real sign-in exists.
 * Prefer guest_user_id, otherwise fall back to local_user_id.
 */
export function getEffectiveUserId(): string {
  return getGuestUserId() ?? getOrCreateLocalUserId();
}

export function setGuestUserId(id: string | null) {
  if (!id) {
    clearMeta('guest_user_id');
    return;
  }

  setMeta('guest_user_id', id);
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
