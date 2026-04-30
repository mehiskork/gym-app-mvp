jest.mock('../syncWorker', () => ({
  syncNow: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

import { logEvent } from '../../utils/logger';
import { syncNow } from '../syncWorker';
import {
  resetSyncSchedulerForTests,
  scheduleForegroundSync,
  scheduleStartupSync,
  scheduleSyncSoon,
} from '../syncScheduler';

describe('syncScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetSyncSchedulerForTests();
    (syncNow as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetSyncSchedulerForTests();
    jest.useRealTimers();
  });

  it('debounces multiple schedule requests into one syncNow call', async () => {
    scheduleSyncSoon('outbox_write');
    scheduleSyncSoon('outbox_write');
    scheduleSyncSoon('app_start');

    expect(syncNow).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith({ force: false });
  });

  it('swallows and logs scheduled sync errors', async () => {
    (syncNow as jest.Mock).mockRejectedValueOnce(new Error('network down'));

    scheduleSyncSoon('outbox_write');
    await jest.advanceTimersByTimeAsync(3000);

    expect(logEvent).toHaveBeenCalledWith('warn', 'sync', 'Scheduled sync failed', {
      reason: 'outbox_write',
      error: 'network down',
    });
  });

  it('applies foreground cooldown across repeated active transitions', async () => {
    jest.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));

    scheduleForegroundSync('app_foreground');
    scheduleForegroundSync('app_foreground');

    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith({ force: false });

    jest.setSystemTime(new Date('2026-04-30T12:00:30.000Z'));
    scheduleForegroundSync('app_foreground');
    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-04-30T12:00:46.000Z'));
    scheduleForegroundSync('app_foreground');
    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  it('treats startup sync as a foreground cooldown anchor', async () => {
    jest.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));

    scheduleStartupSync('app_start');
    scheduleForegroundSync('app_foreground');

    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith({ force: false });
  });
});
