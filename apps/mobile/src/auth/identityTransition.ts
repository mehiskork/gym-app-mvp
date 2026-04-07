import { runMigrations } from '../db/migrate';
import { resetLocalDatabase } from '../db/db';
import { seedCuratedExercises } from '../db/curatedExerciseSeed';
import { repairStaleInFlightOps } from '../db/outboxRepo';
import { resumeSync, setClaimed, setClaimedUserId } from '../db/appMetaRepo';
import { ensureRestTimerNotificationChannel } from '../utils/restTimerNotifications';
import { removeString } from '../utils/prefs';
import { clearSensitiveAuthStorage } from './resetSensitiveStorage';

const CLAIM_DEV_USER_ID_KEY = 'claim_dev_user_id';

/**
 * Conservative identity-transition reset.
 * Clears sensitive auth/session material and all local SQLite state,
 * then re-initializes bootstrap-ready local state.
 */
export async function resetToGuestBootstrap(): Promise<void> {
    await clearSensitiveAuthStorage();
    await removeString(CLAIM_DEV_USER_ID_KEY);
    resetLocalDatabase();
    runMigrations();
    seedCuratedExercises();
    repairStaleInFlightOps(120);
    setClaimed(false);
    setClaimedUserId(null);
    resumeSync();
    void ensureRestTimerNotificationChannel(false);
}