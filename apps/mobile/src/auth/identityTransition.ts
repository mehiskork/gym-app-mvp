import { runMigrations } from '../db/migrate';
import { resetLocalDatabase } from '../db/db';
import { seedCuratedExercises } from '../db/curatedExerciseSeed';
import { repairStaleInFlightOps } from '../db/outboxRepo';
import { resumeSync, setClaimed, setClaimedUserId } from '../db/appMetaRepo';
import { ensureRestTimerNotificationChannel } from '../utils/restTimerNotifications';
import { cancelUnfinishedWorkoutReminder } from '../utils/unfinishedWorkoutReminderNotifications';
import { removeString } from '../utils/prefs';
import { clearSensitiveAuthStorage } from './resetSensitiveStorage';

const CLAIM_DEV_USER_ID_KEY = 'claim_dev_user_id';

type ResetToGuestBootstrapOptions = {
  resumeSyncAfterReset?: boolean;
};

/**
 * Conservative identity-transition reset.
 * Clears sensitive auth/session material and all local SQLite state,
 * then re-initializes bootstrap-ready local state.
 */
export async function resetToGuestBootstrap({
  resumeSyncAfterReset = true,
}: ResetToGuestBootstrapOptions = {}): Promise<void> {
  await cancelUnfinishedWorkoutReminder().catch(() => undefined);
  await clearSensitiveAuthStorage();
  await removeString(CLAIM_DEV_USER_ID_KEY);
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
  repairStaleInFlightOps(120);
  setClaimed(false);
  setClaimedUserId(null);
  if (resumeSyncAfterReset) {
    resumeSync();
  }
  void ensureRestTimerNotificationChannel(false);
}
