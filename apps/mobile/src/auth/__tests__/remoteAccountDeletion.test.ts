import { handleRemoteAccountDeletedCleanup } from '../remoteAccountDeletion';
import { pauseSync } from '../../db/appMetaRepo';
import { accountSessionStore } from '../accountSessionStore';
import { signOutFromGoogle } from '../firebaseGoogleAuthClient';
import { resetToGuestBootstrap } from '../identityTransition';
import { cancelScheduledSync } from '../../sync/syncScheduler';
import { logEvent } from '../../utils/logger';

jest.mock('../../db/appMetaRepo', () => ({
  pauseSync: jest.fn(),
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    invalidate: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../firebaseGoogleAuthClient', () => ({
  signOutFromGoogle: jest.fn(() => Promise.resolve()),
}));

jest.mock('../identityTransition', () => ({
  resetToGuestBootstrap: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../sync/syncScheduler', () => ({
  cancelScheduledSync: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

describe('handleRemoteAccountDeletedCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (accountSessionStore.invalidate as jest.Mock).mockResolvedValue(undefined);
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (resetToGuestBootstrap as jest.Mock).mockResolvedValue(undefined);
    (logEvent as jest.Mock).mockImplementation(() => undefined);
  });

  it('writes account_deleted_remote diagnostic after guest-bootstrap reset', async () => {
    await handleRemoteAccountDeletedCleanup();

    expect(pauseSync).toHaveBeenCalledWith('account_deletion');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(1);
    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('account_deleted_remote');
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: true });
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'auth',
      'Remote account deletion cleanup completed',
      { reason: 'account_deleted_remote' },
    );
    expect((resetToGuestBootstrap as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (logEvent as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('does not fail cleanup when post-reset diagnostic write fails', async () => {
    (logEvent as jest.Mock).mockImplementationOnce(() => {
      throw new Error('log write failed');
    });

    await expect(handleRemoteAccountDeletedCleanup()).resolves.toBeUndefined();

    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: true });
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});
