import {
  getOrCreateDeviceId,
  isSyncPaused,
  setLastSyncAckSummary,
  setGuestUserId,
  updateAuthDebugState,
} from '../db/appMetaRepo';
import { deviceCredentialStore } from '../auth/deviceCredentialStore';
import { accountSessionStore } from '../auth/accountSessionStore';
import { getUsableAccountSessionWithFreshToken } from '../auth/firebaseGoogleAuthClient';
import { resolveLocalAccountStateFromSession } from '../auth/localAccountState';
import {
  claimOutboxOps,
  markOutboxOpRejected,
  markOutboxOpsAcked,
  markOutboxOpsFailed,
  repairStaleInFlightOps,
  type OutboxOp,
} from '../db/outboxRepo';
import { getSyncState, normalizeCursor, updateSyncState } from '../db/syncStateRepo';
import { createSyncRun, finishSyncRun } from '../db/syncRunRepo';
import { inTransaction } from '../db/tx';
import { safeJsonParse } from '../utils/json';
import { logEvent } from '../utils/logger';
import { getApiBaseUrl } from '../api/config';
import { ACCOUNT_DELETED_CODE } from '../api/errors';
import { handleRemoteAccountDeletedCleanup } from '../auth/remoteAccountDeletion';
import {
  applyDeltas,
  getSyncApplyFailureDiagnosticFromError,
  persistSyncApplyFailureDiagnostic,
  type SyncDelta,
} from './applyDeltas';
import { rebuildPrEventsFromWorkoutHistory } from '../db/prRepo';

import {
  OUTBOX_STALE_IN_FLIGHT_SECONDS,
  SYNC_BACKOFF_BASE_SECONDS,
  SYNC_BACKOFF_MAX_SECONDS,
  SYNC_BATCH_LIMIT,
} from './constants';
import { ACTIVE_WORKOUT_ENTITY_TYPES } from './activeWorkoutEntities';

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
  | { status: 'ready'; token: string; authType: 'account_jwt' }
  | { status: 'ready'; token: string; authType: 'device_token' }
  | { status: 'blocked'; errorCode: 'account_reauth_required' };

type SyncAck = {
  opId: string;
  status?: string;
  reason?: string | null;
};

type ErrorResponseBody = {
  code?: string;
};

type AckClassification = {
  ackedIds: string[];
  rejected: Array<{ op: OutboxOp; reason: string }>;
  missing: OutboxOp[];
  counts: { applied: number; noop: number; rejected: number };
};

const WORKOUT_HISTORY_ENTITY_TYPES = new Set([
  'workout_session',
  'workout_session_exercise',
  'workout_set',
]);

function syncEntityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

async function resolveSyncAuthContext(): Promise<SyncAuthContext | null> {
  const accountSession = await getUsableAccountSessionWithFreshToken();
  const localAccountState = resolveLocalAccountStateFromSession(accountSession);

  if (localAccountState.status === 'linked_with_usable_account') {
    return {
      status: 'ready',
      token: localAccountState.accountSession.accessToken,
      authType: 'account_jwt',
    };
  }

  if (localAccountState.status === 'linked_reauth_required') {
    return { status: 'blocked', errorCode: 'account_reauth_required' };
  }

  const deviceToken = await deviceCredentialStore.getDeviceToken();
  if (!deviceToken) {
    return null;
  }

  return { status: 'ready', token: deviceToken, authType: 'device_token' };
}

function classifyAcks(ops: OutboxOp[], acks: SyncAck[] = []): AckClassification {
  const opsById = new Map(ops.map((op) => [op.op_id, op]));
  const seen = new Set<string>();
  const ackedIds: string[] = [];
  const rejected: Array<{ op: OutboxOp; reason: string }> = [];
  const counts = { applied: 0, noop: 0, rejected: 0 };

  for (const ack of acks) {
    const op = opsById.get(ack.opId);
    if (!op) {
      throw new Error(`sync response acked unknown opId: ${ack.opId}`);
    }
    if (seen.has(ack.opId)) {
      throw new Error(`sync response duplicated opId ack: ${ack.opId}`);
    }
    seen.add(ack.opId);

    const status = ack.status ?? 'applied';
    if (status === 'applied') {
      counts.applied += 1;
      ackedIds.push(ack.opId);
      continue;
    }
    if (status === 'noop') {
      counts.noop += 1;
      ackedIds.push(ack.opId);
      continue;
    }
    if (status === 'rejected') {
      counts.rejected += 1;
      rejected.push({ op, reason: ack.reason ?? 'rejected' });
      continue;
    }

    throw new Error(`sync response returned unknown ack status: ${status}`);
  }

  const missing = ops.filter((op) => !seen.has(op.op_id));
  return { ackedIds, rejected, missing, counts };
}

async function readErrorResponseCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as ErrorResponseBody | null;
    return typeof body?.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
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

export async function waitForInFlightSync(): Promise<void> {
  if (inFlightSync) {
    await inFlightSync;
  }
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
    logEvent('info', 'sync', 'Sync paused');
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
  if (authContext?.status === 'blocked') {
    updateSyncState({
      last_error: authContext.errorCode,
      backoff_until: null,
      consecutive_failures: 0,
    });
    updateAuthDebugState({
      syncAuthModeNextPlanned: 'blocked_reauth',
    });
    return false;
  }

  if (!authContext) {
    await registerDeviceIfNeeded();
    authContext = await resolveSyncAuthContext();
    if (authContext?.status === 'blocked') {
      updateSyncState({
        last_error: authContext.errorCode,
        backoff_until: null,
        consecutive_failures: 0,
      });
      updateAuthDebugState({
        syncAuthModeNextPlanned: 'blocked_reauth',
      });
      return false;
    }
    if (!authContext) {
      updateSyncState({ last_error: 'Device not registered (missing token).' });
      updateAuthDebugState({
        syncAuthModeNextPlanned: null,
      });
      return false;
    }
  }
  updateAuthDebugState({
    syncAuthModeNextPlanned: authContext.authType,
  });

  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  const ops = options.pullOnly ? [] : claimOutboxOps(SYNC_BATCH_LIMIT);
  const protectedEntityKeys = new Set(
    ops
      .filter((op) => ACTIVE_WORKOUT_ENTITY_TYPES.has(op.entity_type))
      .map((op) => syncEntityKey(op.entity_type, op.entity_id)),
  );
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
      const responseCode = await readErrorResponseCode(response);
      if (
        authContext.authType === 'account_jwt' &&
        response.status === 410 &&
        responseCode === ACCOUNT_DELETED_CODE
      ) {
        errorCode = 'account_deleted_remote';
        errorMessage = 'TrainFrame account was deleted';
        await handleRemoteAccountDeletedCleanup();
        updateAuthDebugState({
          syncAuthModeLastUsed: authContext.authType,
          syncAuthModeNextPlanned: 'device_token',
        });
        return false;
      }
      errorCode = classifyErrorCode(null, response.status);
      throw new Error(`sync failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      acks: SyncAck[];
      cursor?: string;
      deltas?: SyncDelta[];
      hasMore?: boolean;
    };

    const ackClassification = classifyAcks(ops, data.acks ?? []);
    ackCounts = ackClassification.counts;
    let deltaSummary = { applied: 0, skipped: 0, total: 0 };
    deltasReceived = data.deltas?.length ?? 0;
    cursorAfter = normalizeCursor(data.cursor ?? cursor);
    const shouldRebuildPrEvents = (data.deltas ?? []).some((delta) =>
      WORKOUT_HISTORY_ENTITY_TYPES.has(delta.entityType),
    );

    inTransaction(() => {
      if (!options.pullOnly) {
        markOutboxOpsAcked(ackClassification.ackedIds);
        for (const { op, reason } of ackClassification.rejected) {
          markOutboxOpRejected(op.op_id, `sync op rejected: ${reason}`, (attemptCount) =>
            nextAttemptAtFromNow(computeBackoffSeconds(attemptCount)),
          );
        }
        if (ackClassification.missing.length > 0) {
          markOutboxOpsFailed(
            ackClassification.missing,
            'sync response missing opId ack',
            (attemptCount) => nextAttemptAtFromNow(computeBackoffSeconds(attemptCount)),
          );
        }
      }

      deltaSummary = applyDeltas(data.deltas ?? [], {
        cursorBefore: cursor,
        responseCursor: cursorAfter,
        protectedEntityKeys,
      });
      deltasApplied = deltaSummary.applied;
      if (shouldRebuildPrEvents) {
        rebuildPrEventsFromWorkoutHistory();
      }
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
    for (const { op, reason } of ackClassification.rejected) {
      logEvent('warn', 'sync', 'Sync op rejected', {
        opId: op.op_id,
        entityType: op.entity_type,
        entityId: op.entity_id,
        reason,
      });
    }
    logEvent('info', 'sync', 'Sync response processed', {
      ackCount:
        ackClassification.ackedIds.length +
        ackClassification.rejected.length +
        ackClassification.missing.length,
      ackApplied: ackCounts.applied,
      ackNoop: ackCounts.noop,
      ackRejected: ackCounts.rejected,
      deltaApplied: deltaSummary.applied,
      deltaSkipped: deltaSummary.skipped,
      deltaTotal: deltaSummary.total,
      ackMissing: ackClassification.missing.length,
    });

    hasMore = data.hasMore === true;
    updateAuthDebugState({
      syncAuthModeLastUsed: authContext.authType,
      syncAuthModeNextPlanned: authContext.authType,
    });
  } catch (err) {
    if (httpStatus === 401) {
      errorCode =
        authContext.authType === 'device_token'
          ? 'auth_401_device_token_cleared'
          : 'auth_401_account_session';
      errorMessage = err instanceof Error ? err.message : 'Unauthorized';
      if (authContext.authType === 'device_token') {
        await deviceCredentialStore.setDeviceToken(null);
      } else {
        await accountSessionStore.invalidate('sync_401');
      }
      updateAuthDebugState({
        syncAuthModeLastUsed: authContext.authType,
      });
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
    persistSyncApplyFailureDiagnostic(getSyncApplyFailureDiagnosticFromError(err));
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
