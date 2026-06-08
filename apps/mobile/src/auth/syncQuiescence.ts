import { getSyncPauseReason, pauseSync, resumeSync, type SyncPauseReason } from '../db/appMetaRepo';
import { listNonAckedOutboxOps, repairStaleInFlightOps } from '../db/outboxRepo';
import { cancelScheduledSync } from '../sync/syncScheduler';
import { OUTBOX_STALE_IN_FLIGHT_SECONDS } from '../sync/constants';
import { syncNow, waitForInFlightSync } from '../sync/syncWorker';

export const PENDING_SYNC_BEFORE_IDENTITY_RESET_ERROR =
  'Sync pending changes before signing out or switching accounts.';

export async function quiesceSyncBeforeIdentityReset(
  reason: SyncPauseReason = 'identity_reset',
): Promise<void> {
  cancelScheduledSync();
  await waitForInFlightSync();
  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  await syncNow({ force: true });
  await waitForInFlightSync();
  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  if (listNonAckedOutboxOps(1).length > 0) {
    throw new Error(PENDING_SYNC_BEFORE_IDENTITY_RESET_ERROR);
  }

  pauseSync(reason);
  cancelScheduledSync();
  await waitForInFlightSync();
}

export function recoverInterruptedIdentityResetPause(): boolean {
  if (getSyncPauseReason() !== 'identity_reset') {
    return false;
  }

  resumeSync();
  return true;
}
