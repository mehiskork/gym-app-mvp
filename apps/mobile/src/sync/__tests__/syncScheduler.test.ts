jest.mock('../syncWorker', () => ({
  syncNow: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  isSyncPaused: jest.fn(() => false),
}));

import { logEvent } from '../../utils/logger';
import { isSyncPaused } from '../../db/appMetaRepo';
import { syncNow } from '../syncWorker';
import {
  cancelScheduledSync,
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
    (isSyncPaused as jest.Mock).mockReturnValue(false);
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

  it('routes startup and foreground sync attempts through the worker recovery path', async () => {
    jest.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));

    scheduleStartupSync('app_start');
    await jest.advanceTimersByTimeAsync(3000);

    jest.setSystemTime(new Date('2026-04-30T12:01:00.000Z'));
    scheduleForegroundSync('app_foreground');
    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).toHaveBeenCalledTimes(2);
    expect(syncNow).toHaveBeenNthCalledWith(1, { force: false });
    expect(syncNow).toHaveBeenNthCalledWith(2, { force: false });
  });

  it('cancels pending scheduled sync before it starts', async () => {
    scheduleSyncSoon('outbox_write');
    cancelScheduledSync();

    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).not.toHaveBeenCalled();
  });

  it('does not create a timer or call syncNow while sync is paused', async () => {
    (isSyncPaused as jest.Mock).mockReturnValue(true);

    scheduleSyncSoon('outbox_write');
    await jest.advanceTimersByTimeAsync(3000);

    expect(syncNow).not.toHaveBeenCalled();
  });
});
