import {
  getDeviceToken,
  getGuestUserId,
  getOrCreateDeviceId,
  getOrCreateDeviceSecret,
  setDeviceToken,
  setGuestUserId,
} from '../db/appMetaRepo';
import { listPendingOutboxOps, markOutboxOpFailed, markOutboxOpsAcked } from '../db/outboxRepo';
import { getSyncState, updateSyncState } from '../db/syncStateRepo';
import { inTransaction } from '../db/tx';

const DEFAULT_BATCH_LIMIT = 50;

function getBaseUrl(): string | null {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? null;
}

function nextAttemptAtFromNow(seconds: number): string {
  const ms = seconds * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function computeBackoffSeconds(attemptCount: number): number {
  const base = 5 * Math.pow(2, attemptCount);
  return Math.min(base, 300);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { _parseError: true, raw: value };
  }
}

export async function registerDeviceIfNeeded(): Promise<void> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return;

  const existingToken = getDeviceToken();
  if (existingToken) return;

  const deviceId = getOrCreateDeviceId();
  const deviceSecret = getOrCreateDeviceSecret();

  try {
    const response = await fetch(`${baseUrl}/device/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, deviceSecret }),
    });

    if (!response.ok) {
      updateSyncState({ last_error: `registerDeviceIfNeeded: ${response.status}` });
      return;
    }

    const data = (await response.json()) as {
      deviceToken?: string;
      guestUserId?: string;
    };

    if (data.deviceToken) {
      setDeviceToken(data.deviceToken);
    }
    if (data.guestUserId) {
      setGuestUserId(data.guestUserId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    updateSyncState({ last_error: `registerDeviceIfNeeded: ${message}` });
  }
}

export async function syncNow(): Promise<void> {
  const baseUrl = getBaseUrl();
  const syncState = getSyncState();

  if (!baseUrl) {
    updateSyncState({ last_error: 'Sync base URL not configured.' });
    return;
  }

  if (syncState.backoff_until) {
    const backoffTime = Date.parse(syncState.backoff_until);
    if (!Number.isNaN(backoffTime) && backoffTime > Date.now()) {
      return;
    }
  }

  const token = getDeviceToken();
  if (!token) {
    updateSyncState({ last_error: 'Device not registered (missing token).' });
    return;
  }

  const ops = listPendingOutboxOps(DEFAULT_BATCH_LIMIT);
  const cursor = syncState.cursor;

  try {
    const response = await fetch(`${baseUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cursor,
        ops: ops.map((op) => ({
          opId: op.op_id,
          deviceId: op.device_id,
          userId: op.user_id ?? getGuestUserId(),
          entityType: op.entity_type,
          entityId: op.entity_id,
          opType: op.op_type,
          payload: safeJsonParse(op.payload_json),
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`sync failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      acks: Array<{ opId: string }>;
      cursor?: string;
      deltas?: Array<{
        entityType: string;
        entityId: string;
        opType: string;
        payload: unknown;
      }>;
    };

    const ackIds = data.acks?.map((ack) => ack.opId) ?? [];

    inTransaction(() => {
      markOutboxOpsAcked(ackIds);
      updateSyncState({
        cursor: data.cursor ?? cursor,
        last_sync_at: new Date().toISOString(),
        last_error: null,
        backoff_until: null,
        consecutive_failures: 0,
      });

      if (data.deltas && data.deltas.length > 0) {
        console.warn('Sync delta apply not implemented yet.', data.deltas.length);
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const nextFailureCount = (syncState.consecutive_failures ?? 0) + 1;
    const backoffSeconds = computeBackoffSeconds(nextFailureCount);
    const nextAttempt = nextAttemptAtFromNow(backoffSeconds);

    inTransaction(() => {
      updateSyncState({
        last_error: message,
        backoff_until: nextAttempt,
        consecutive_failures: nextFailureCount,
      });

      for (const op of ops) {
        const opBackoff = computeBackoffSeconds(op.attempt_count + 1);
        const opNextAttempt = nextAttemptAtFromNow(opBackoff);
        markOutboxOpFailed(op.op_id, message, opNextAttempt);
      }
    });
  }
}
