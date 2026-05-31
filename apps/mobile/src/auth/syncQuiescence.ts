import { getSyncPauseReason, pauseSync, resumeSync, type SyncPauseReason } from '../db/appMetaRepo';
import { cancelScheduledSync } from '../sync/syncScheduler';
import { waitForInFlightSync } from '../sync/syncWorker';

export async function quiesceSyncBeforeIdentityReset(
  reason: SyncPauseReason = 'identity_reset',
): Promise<void> {
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
