import { resetToGuestBootstrap } from '../identityTransition';
import { clearSensitiveAuthStorage } from '../resetSensitiveStorage';
import { resetLocalDatabase } from '../../db/db';
import { runMigrations } from '../../db/migrate';
import { seedCuratedExercises } from '../../db/curatedExerciseSeed';
import { repairStaleInFlightOps } from '../../db/outboxRepo';
import { resumeSync, setClaimed, setClaimedUserId } from '../../db/appMetaRepo';
import { ensureRestTimerNotificationChannel } from '../../utils/restTimerNotifications';
import { cancelUnfinishedWorkoutReminder } from '../../utils/unfinishedWorkoutReminderNotifications';
import { removeString } from '../../utils/prefs';

jest.mock('../resetSensitiveStorage', () => ({
  clearSensitiveAuthStorage: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../db/db', () => ({
  resetLocalDatabase: jest.fn(),
}));

jest.mock('../../db/migrate', () => ({
  runMigrations: jest.fn(),
}));

jest.mock('../../db/curatedExerciseSeed', () => ({
  seedCuratedExercises: jest.fn(),
}));

jest.mock('../../db/outboxRepo', () => ({
  repairStaleInFlightOps: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  resumeSync: jest.fn(),
  setClaimed: jest.fn(),
  setClaimedUserId: jest.fn(),
}));

jest.mock('../../utils/restTimerNotifications', () => ({
  ensureRestTimerNotificationChannel: jest.fn(),
}));

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  cancelUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/prefs', () => ({
  removeString: jest.fn(() => Promise.resolve()),
}));

describe('resetToGuestBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears sensitive session state and fully resets local bootstrap state', async () => {
    await resetToGuestBootstrap();

    expect(removeString).toHaveBeenCalledWith('claim_dev_user_id');

    expect(cancelUnfinishedWorkoutReminder).toHaveBeenCalledTimes(1);
    expect(clearSensitiveAuthStorage).toHaveBeenCalledTimes(1);
    expect(resetLocalDatabase).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(seedCuratedExercises).toHaveBeenCalledTimes(1);
    expect(repairStaleInFlightOps).toHaveBeenCalledWith(120);
    expect(setClaimed).toHaveBeenCalledWith(false);
    expect(setClaimedUserId).toHaveBeenCalledWith(null);
    expect(resumeSync).toHaveBeenCalledTimes(1);
    expect(ensureRestTimerNotificationChannel).toHaveBeenCalledWith(false);
    expect((cancelUnfinishedWorkoutReminder as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (resetLocalDatabase as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('can leave sync suppressed for account deletion cleanup until the marker is cleared', async () => {
    await resetToGuestBootstrap({ resumeSyncAfterReset: false });

    expect(clearSensitiveAuthStorage).toHaveBeenCalledTimes(1);
    expect(resetLocalDatabase).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(resumeSync).not.toHaveBeenCalled();
  });

  it('continues local reset if unfinished reminder cancellation fails', async () => {
    (cancelUnfinishedWorkoutReminder as jest.Mock).mockRejectedValueOnce(
      new Error('cancel failed'),
    );

    await resetToGuestBootstrap();

    expect(resetLocalDatabase).toHaveBeenCalledTimes(1);
  });
});
