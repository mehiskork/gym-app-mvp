import {
  PENDING_SYNC_BEFORE_IDENTITY_RESET_ERROR,
  quiesceSyncBeforeIdentityReset,
  recoverInterruptedIdentityResetPause,
} from '../syncQuiescence';
import { getSyncPauseReason, pauseSync, resumeSync } from '../../db/appMetaRepo';
import { listNonAckedOutboxOps, repairStaleInFlightOps } from '../../db/outboxRepo';
import { cancelScheduledSync } from '../../sync/syncScheduler';
import { syncNow, waitForInFlightSync } from '../../sync/syncWorker';

jest.mock('../../db/appMetaRepo', () => ({
  getSyncPauseReason: jest.fn(() => null),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
}));

jest.mock('../../sync/syncScheduler', () => ({
  cancelScheduledSync: jest.fn(),
}));

jest.mock('../../sync/syncWorker', () => ({
  syncNow: jest.fn(() => Promise.resolve()),
  waitForInFlightSync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../db/outboxRepo', () => ({
  listNonAckedOutboxOps: jest.fn(() => []),
  repairStaleInFlightOps: jest.fn(),
}));

describe('sync quiescence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSyncPauseReason as jest.Mock).mockReturnValue(null);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([]);
  });

  it('drains pending sync, pauses, cancels scheduled sync, and waits before identity reset', async () => {
    await quiesceSyncBeforeIdentityReset();

    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(repairStaleInFlightOps).toHaveBeenCalledTimes(2);
    expect(listNonAckedOutboxOps).toHaveBeenCalledWith(1);
    expect(pauseSync).toHaveBeenCalledWith('identity_reset');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(2);
    expect(waitForInFlightSync).toHaveBeenCalledTimes(3);
    expect((syncNow as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (pauseSync as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((pauseSync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (cancelScheduledSync as jest.Mock).mock.invocationCallOrder[1],
    );
  });

  it('blocks identity reset when pending outbox rows remain after forced sync', async () => {
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([{ op_id: 'op-1' }]);

    await expect(quiesceSyncBeforeIdentityReset()).rejects.toThrow(
      PENDING_SYNC_BEFORE_IDENTITY_RESET_ERROR,
    );

    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(pauseSync).not.toHaveBeenCalled();
  });

  it('resumes interrupted identity reset pause on startup', () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('identity_reset');

    expect(recoverInterruptedIdentityResetPause()).toBe(true);

    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret account deletion pause during startup', () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('account_deletion');

    expect(recoverInterruptedIdentityResetPause()).toBe(false);

    expect(resumeSync).not.toHaveBeenCalled();
  });
});
