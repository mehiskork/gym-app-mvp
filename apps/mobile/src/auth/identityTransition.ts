import { runMigrations } from '../db/migrate';
import { resetLocalDatabase } from '../db/db';
import { seedCuratedExercises } from '../db/curatedExerciseSeed';
import { repairStaleInFlightOps } from '../db/outboxRepo';
import { resumeSync, setClaimed, setClaimedUserId } from '../db/appMetaRepo';
import { ensureRestTimerNotificationChannel } from '../utils/restTimerNotifications';
import { clearSensitiveAuthStorage } from './resetSensitiveStorage';

/**
 * Conservative identity-transition reset.
 * Clears sensitive auth/session material and all local SQLite state,
 * then re-initializes bootstrap-ready local state.
 */
export async function resetToGuestBootstrap(): Promise<void> {
    await clearSensitiveAuthStorage();
    resetLocalDatabase();
    runMigrations();
    seedCuratedExercises();
    repairStaleInFlightOps(120);
    setClaimed(false);
    setClaimedUserId(null);
    resumeSync();
    void ensureRestTimerNotificationChannel(false);
}