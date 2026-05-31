import {
  quiesceSyncBeforeIdentityReset,
  recoverInterruptedIdentityResetPause,
} from '../syncQuiescence';
import { getSyncPauseReason, pauseSync, resumeSync } from '../../db/appMetaRepo';
import { cancelScheduledSync } from '../../sync/syncScheduler';
import { waitForInFlightSync } from '../../sync/syncWorker';

jest.mock('../../db/appMetaRepo', () => ({
  getSyncPauseReason: jest.fn(() => null),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
}));

jest.mock('../../sync/syncScheduler', () => ({
  cancelScheduledSync: jest.fn(),
}));

jest.mock('../../sync/syncWorker', () => ({
  waitForInFlightSync: jest.fn(() => Promise.resolve()),
}));

describe('sync quiescence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSyncPauseReason as jest.Mock).mockReturnValue(null);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
  });

  it('pauses, cancels scheduled sync, and waits for in-flight sync before identity reset', async () => {
    await quiesceSyncBeforeIdentityReset();

    expect(pauseSync).toHaveBeenCalledWith('identity_reset');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(1);
    expect(waitForInFlightSync).toHaveBeenCalledTimes(1);
    expect((pauseSync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (cancelScheduledSync as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((cancelScheduledSync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (waitForInFlightSync as jest.Mock).mock.invocationCallOrder[0],
    );
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
