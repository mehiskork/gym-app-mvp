import {
  getOrCreateDeviceId,
  isSyncPaused,
  setLastSyncAckSummary,
  setGuestUserId,
} from '../db/appMetaRepo';
import { deviceCredentialStore } from '../auth/deviceCredentialStore';
import { accountSessionStore } from '../auth/accountSessionStore';
import {
  claimOutboxOps,
  markOutboxOpsAcked,
  markOutboxOpsFailed,
  repairStaleInFlightOps,
} from '../db/outboxRepo';
import { getSyncState, normalizeCursor, updateSyncState } from '../db/syncStateRepo';
import { createSyncRun, finishSyncRun } from '../db/syncRunRepo';
import { inTransaction } from '../db/tx';
import { safeJsonParse } from '../utils/json';
import { logEvent } from '../utils/logger';
import { getApiBaseUrl } from '../api/config';
import { applyDeltas, type SyncDelta } from './applyDeltas';

import {
  OUTBOX_STALE_IN_FLIGHT_SECONDS,
  SYNC_BACKOFF_BASE_SECONDS,
  SYNC_BACKOFF_MAX_SECONDS,
  SYNC_BATCH_LIMIT,
} from './constants';

function nextAttemptAtFromNow(seconds: number): string {
  const ms = seconds * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function computeBackoffSeconds(attemptCount: number): number {
  const base = SYNC_BACKOFF_BASE_SECONDS * Math.pow(2, attemptCount);
  return Math.min(base, SYNC_BACKOFF_MAX_SECONDS);
}
function classifyErrorCode(err: unknown, httpStatus?: number | null): string {
  if (httpStatus === 401) return 'http_401';
  if (httpStatus === 403) return 'http_403';
  if (httpStatus === 429) return 'http_429';
  if (typeof httpStatus === 'number' && httpStatus >= 500) return 'server_error';

  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/network/i.test(message)) return 'network';
  if (/timeout/i.test(message)) return 'network';
  if (/offline/i.test(message)) return 'network';

  return 'unknown';
}

export async function registerDeviceIfNeeded(): Promise<void> {
  const baseUrl = getApiBaseUrl();

  const existingToken = await deviceCredentialStore.getDeviceToken();
  if (existingToken) return;

  const deviceId = getOrCreateDeviceId();
  const deviceSecret = await deviceCredentialStore.getOrCreateDeviceSecret();

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
      await deviceCredentialStore.setDeviceToken(data.deviceToken);
    }
    if (data.guestUserId) {
      setGuestUserId(data.guestUserId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    updateSyncState({ last_error: `registerDeviceIfNeeded: ${message}` });
  }
}

const MAX_CONTINUATION_PAGES = 10;
let inFlightSync: Promise<void> | null = null;

type SyncNowOptions = {
  force?: boolean;
  pullOnly?: boolean;
  continuationDepth?: number;
};

type SyncAuthContext =
  | { token: string; authType: 'account_jwt' }
  | { token: string; authType: 'device_token' };

async function resolveSyncAuthContext(): Promise<SyncAuthContext | null> {
  const accountSession = await accountSessionStore.get();
  if (accountSession?.accessToken) {
    return { token: accountSession.accessToken, authType: 'account_jwt' };
  }

  const deviceToken = await deviceCredentialStore.getDeviceToken();
  if (!deviceToken) {
    return null;
  }

  return { token: deviceToken, authType: 'device_token' };
}

export async function syncNow(): Promise<void>;
export async function syncNow(options?: SyncNowOptions): Promise<void>;
export async function syncNow(options: SyncNowOptions = {}): Promise<void> {
  if (inFlightSync) {
    return inFlightSync;
  }

  const run = runSyncChain(options).finally(() => {
    if (inFlightSync === run) {
      inFlightSync = null;
    }
  });

  inFlightSync = run;
  return run;
}

async function runSyncChain(options: SyncNowOptions): Promise<void> {
  let continuationDepth = options.continuationDepth ?? 0;
  let runOptions = options;

  while (true) {
    const hasMore = await runSyncPage(runOptions);

    if (!hasMore) {
      return;
    }

    if (continuationDepth >= MAX_CONTINUATION_PAGES) {
      logEvent('warn', 'sync', 'Sync continuation limit reached', {
        continuationDepth,
        maxContinuationPages: MAX_CONTINUATION_PAGES,
      });
      return;
    }

    continuationDepth += 1;
    logEvent('info', 'sync', 'Sync continuation paging', {
      continuationDepth,
    });

    runOptions = {
      force: true,
      pullOnly: true,
      continuationDepth,
    };
  }
}

async function runSyncPage(options: SyncNowOptions): Promise<boolean> {
  if (isSyncPaused()) {
    logEvent('info', 'sync', 'Sync paused', { reason: 'claim' });
    return false;
  }

  // Offline-first invariants:
  // - Domain writes + outbox enqueue happen in the SAME SQLite transaction.
  // - We never ack unless the backend explicitly acks opIds.
  // - On network errors (airplane mode, timeout, DNS, 5xx), ops stay pending/failed and visible.
  const baseUrl = getApiBaseUrl();
  const syncState = getSyncState();

  if (!options.force && syncState.backoff_until) {
    const backoffTime = Date.parse(syncState.backoff_until);
    if (!Number.isNaN(backoffTime) && backoffTime > Date.now()) {
      return false;
    }
  }

  let authContext = await resolveSyncAuthContext();
  if (!authContext) {
    await registerDeviceIfNeeded();
    authContext = await resolveSyncAuthContext();
    if (!authContext) {
      updateSyncState({ last_error: 'Device not registered (missing token).' });
      return false;
    }

  }

  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  const ops = options.pullOnly ? [] : claimOutboxOps(SYNC_BATCH_LIMIT);
  const cursor = syncState.cursor;
  const runId = createSyncRun({ cursorBefore: cursor });
  const opsSent = ops.length;
  let ackCounts = { applied: 0, noop: 0, rejected: 0 };
  let deltasReceived = 0;
  let deltasApplied = 0;
  let cursorAfter = cursor;
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let backoffSeconds: number | null = null;
  let status: 'success' | 'failed' = 'failed';
  let hasMore = false;

  try {
    const response = await fetch(`${baseUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authContext.token}`,
      },
      body: JSON.stringify({
        cursor,
        ops: ops.map((op) => ({
          opId: op.op_id,
          entityType: op.entity_type,
          entityId: op.entity_id,
          opType: op.op_type,
          payload: safeJsonParse(op.payload_json),
        })),
      }),
    });

    httpStatus = response.status;

    if (!response.ok) {
      errorCode = classifyErrorCode(null, response.status);
      throw new Error(`sync failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      acks: Array<{ opId: string; status?: string; reason?: string | null }>;
      cursor?: string;
      deltas?: SyncDelta[];
      hasMore?: boolean;
    };

    const opsById = new Map(ops.map((op) => [op.op_id, op]));
    ackCounts = { applied: 0, noop: 0, rejected: 0 };
    const ackIds =
      data.acks?.map((ack) => {
        const status = ack.status ?? 'applied';
        if (status === 'applied') ackCounts.applied += 1;
        else if (status === 'noop') ackCounts.noop += 1;
        else if (status === 'rejected') ackCounts.rejected += 1;
        if (status === 'rejected') {
          const op = opsById.get(ack.opId);
          logEvent('warn', 'sync', 'Sync op rejected', {
            opId: ack.opId,
            entityType: op?.entity_type ?? null,
            entityId: op?.entity_id ?? null,
            reason: ack.reason ?? null,
          });
        }
        return ack.opId;
      }) ?? [];
    const acked = new Set(ackIds);
    const unacked = ops.filter((op) => !acked.has(op.op_id));
    let deltaSummary = { applied: 0, skipped: 0, total: 0 };
    deltasReceived = data.deltas?.length ?? 0;
    cursorAfter = normalizeCursor(data.cursor ?? cursor);

    inTransaction(() => {
      if (!options.pullOnly) {
        markOutboxOpsAcked(ackIds);
      }

      deltaSummary = applyDeltas(data.deltas ?? []);
      deltasApplied = deltaSummary.applied;
      updateSyncState({
        cursor: cursorAfter,
        last_sync_at: new Date().toISOString(),
        last_error: null,
        backoff_until: null,
        consecutive_failures: 0,
        last_delta_count: deltaSummary.applied,
      });
      setLastSyncAckSummary(ackCounts);
      status = 'success';
    });
    logEvent('info', 'sync', 'Sync response processed', {
      ackCount: ackIds.length,
      ackApplied: ackCounts.applied,
      ackNoop: ackCounts.noop,
      ackRejected: ackCounts.rejected,
      deltaApplied: deltaSummary.applied,
      deltaSkipped: deltaSummary.skipped,
      deltaTotal: deltaSummary.total,
    });
    if (unacked.length > 0) {
      const message = 'sync response missing opId ack';
      inTransaction(() => {
        markOutboxOpsFailed(unacked, message, (attemptCount) =>
          nextAttemptAtFromNow(computeBackoffSeconds(attemptCount)),
        );
        updateSyncState({ last_error: message });
      });
    }

    hasMore = data.hasMore === true;
  } catch (err) {
    if (httpStatus === 401) {
      errorCode =
        authContext.authType === 'device_token' ? 'auth_401_device_token_cleared' : 'auth_401_account_session';
      errorMessage = err instanceof Error ? err.message : 'Unauthorized';
      if (authContext.authType === 'device_token') {
        await deviceCredentialStore.setDeviceToken(null);
      }
      inTransaction(() => {
        updateSyncState({
          last_error: errorCode,
          backoff_until: null,
          consecutive_failures: 0,
        });
      });
      return false;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    const nextFailureCount = (syncState.consecutive_failures ?? 0) + 1;
    backoffSeconds = computeBackoffSeconds(nextFailureCount);
    const nextAttempt = nextAttemptAtFromNow(backoffSeconds);
    errorMessage = message;
    errorCode = errorCode ?? classifyErrorCode(err, httpStatus);

    inTransaction(() => {
      updateSyncState({
        last_error: message,
        backoff_until: nextAttempt,
        consecutive_failures: nextFailureCount,
      });

      markOutboxOpsFailed(ops, message, (attemptCount) =>
        nextAttemptAtFromNow(computeBackoffSeconds(attemptCount)),
      );
    });
  } finally {
    finishSyncRun(runId, {
      status,
      cursorAfter,
      opsSent,
      acksApplied: ackCounts.applied,
      acksNoop: ackCounts.noop,
      acksRejected: ackCounts.rejected,
      deltasReceived,
      deltasApplied,
      httpStatus,
      errorCode,
      errorMessage,
      backoffSeconds,
    });
  }
  return hasMore;
}
