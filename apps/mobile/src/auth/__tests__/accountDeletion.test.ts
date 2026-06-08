import { ApiError } from '../../api/errors';
import {
  deleteAccountAndResetLocalState,
  getFriendlyAccountDeletionError,
  hasPendingAccountDeletionRecovery,
  recoverAccountDeletionAfterStartup,
  recoverPendingAccountDeletionCleanup,
} from '../accountDeletion';
import { deleteMeWithAccountAuth } from '../../api/accountClient';
import { getSyncPauseReason, pauseSync, resumeSync } from '../../db/appMetaRepo';
import { listNonAckedOutboxOps, repairStaleInFlightOps } from '../../db/outboxRepo';
import { resetToGuestBootstrap } from '../identityTransition';
import { signOutFromGoogle } from '../firebaseGoogleAuthClient';
import { cancelScheduledSync } from '../../sync/syncScheduler';
import { syncNow, waitForInFlightSync } from '../../sync/syncWorker';
import {
  clearAccountDeletionCleanupPending,
  isAccountDeletionCleanupPending,
  markAccountDeletionCleanupPending,
} from '../accountDeletionCleanupMarker';
import { accountSessionStore } from '../accountSessionStore';

jest.mock('../../api/accountClient', () => ({
  deleteMeWithAccountAuth: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getSyncPauseReason: jest.fn(() => null),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    getUsable: jest.fn(() => Promise.resolve(null)),
  },
}));

jest.mock('../identityTransition', () => ({
  resetToGuestBootstrap: jest.fn(() => Promise.resolve()),
}));

jest.mock('../firebaseGoogleAuthClient', () => ({
  signOutFromGoogle: jest.fn(() => Promise.resolve()),
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

jest.mock('../accountDeletionCleanupMarker', () => ({
  clearAccountDeletionCleanupPending: jest.fn(() => Promise.resolve()),
  isAccountDeletionCleanupPending: jest.fn(() => Promise.resolve(false)),
  markAccountDeletionCleanupPending: jest.fn(() => Promise.resolve()),
}));

describe('deleteAccountAndResetLocalState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteMeWithAccountAuth as jest.Mock).mockResolvedValue(undefined);
    (resetToGuestBootstrap as jest.Mock).mockResolvedValue(undefined);
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([]);
    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(false);
    (markAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(undefined);
    (clearAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(undefined);
    (getSyncPauseReason as jest.Mock).mockReturnValue(null);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
  });

  it('pauses sync, waits for in-flight sync, deletes server account, marks cleanup pending, then resets local state', async () => {
    await deleteAccountAndResetLocalState();

    expect(pauseSync).toHaveBeenCalledWith('account_deletion');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(3);
    expect(waitForInFlightSync).toHaveBeenCalledTimes(3);
    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(repairStaleInFlightOps).toHaveBeenCalledTimes(2);
    expect(deleteMeWithAccountAuth).toHaveBeenCalledTimes(1);
    expect(markAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: false });
    expect(clearAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(
      (markAccountDeletionCleanupPending as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan((resetToGuestBootstrap as jest.Mock).mock.invocationCallOrder[0]);
    expect((resetToGuestBootstrap as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (clearAccountDeletionCleanupPending as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(
      (clearAccountDeletionCleanupPending as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan((resumeSync as jest.Mock).mock.invocationCallOrder[0]);
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('does not clear local state when backend deletion fails and resumes sync', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Network down', { isNetworkError: true }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow('Network down');

    expect(markAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('does not reset local state when DELETE /me returns a non-204 2xx response', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Unexpected response status 200', { status: 200 }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow(
      'Unexpected response status 200',
    );

    expect(markAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
  });

  it('does not clear account or device credentials when DELETE /me returns a non-204 2xx response', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Unexpected response status 202', { status: 202 }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow(
      'Unexpected response status 202',
    );

    expect(signOutFromGoogle).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
  });

  it('resumes sync safely when DELETE /me returns a non-204 2xx response', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Unexpected response status 202', { status: 202 }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow(
      'Unexpected response status 202',
    );

    expect(resumeSync).toHaveBeenCalledTimes(1);
    expect(deleteMeWithAccountAuth).toHaveBeenCalledTimes(1);
  });

  it('does not resume sync if local cleanup fails after backend deletion succeeded', async () => {
    (resetToGuestBootstrap as jest.Mock).mockRejectedValueOnce(new Error('reset failed'));

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow('reset failed');

    expect(deleteMeWithAccountAuth).toHaveBeenCalledTimes(1);
    expect(markAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resumeSync).not.toHaveBeenCalled();
  });
});

describe('recoverPendingAccountDeletionCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resetToGuestBootstrap as jest.Mock).mockResolvedValue(undefined);
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([]);
    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(false);
    (clearAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(undefined);
    (getSyncPauseReason as jest.Mock).mockReturnValue(null);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
  });

  it('does nothing when no cleanup marker is pending', async () => {
    await expect(recoverPendingAccountDeletionCleanup()).resolves.toBe(false);

    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
  });

  it('runs local cleanup and clears the marker when cleanup is pending', async () => {
    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValueOnce(true);

    await expect(recoverPendingAccountDeletionCleanup()).resolves.toBe(true);

    expect(pauseSync).toHaveBeenCalledWith('account_deletion');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(1);
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: false });
    expect(clearAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('keeps marker and sync suppression when pending cleanup fails again', async () => {
    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValueOnce(true);
    (resetToGuestBootstrap as jest.Mock).mockRejectedValueOnce(new Error('reset failed'));

    await expect(recoverPendingAccountDeletionCleanup()).rejects.toThrow('reset failed');

    expect(pauseSync).toHaveBeenCalledWith('account_deletion');
    expect(resetToGuestBootstrap).toHaveBeenCalledTimes(1);
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resumeSync).not.toHaveBeenCalled();
  });
});

describe('account deletion startup recovery detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteMeWithAccountAuth as jest.Mock).mockResolvedValue(undefined);
    (resetToGuestBootstrap as jest.Mock).mockResolvedValue(undefined);
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([]);
    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(false);
    (markAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(undefined);
    (clearAccountDeletionCleanupPending as jest.Mock).mockResolvedValue(undefined);
    (getSyncPauseReason as jest.Mock).mockReturnValue(null);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
  });

  it('detects pending recovery from marker or durable account deletion sync pause', async () => {
    await expect(hasPendingAccountDeletionRecovery()).resolves.toBe(false);

    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValueOnce(true);
    await expect(hasPendingAccountDeletionRecovery()).resolves.toBe(true);

    (isAccountDeletionCleanupPending as jest.Mock).mockResolvedValueOnce(false);
    (getSyncPauseReason as jest.Mock).mockReturnValueOnce('account_deletion');
    await expect(hasPendingAccountDeletionRecovery()).resolves.toBe(true);
  });

  it('retries backend deletion on startup when sync pause exists without marker and account session exists', async () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('account_deletion');
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue({ accessToken: 'account.jwt' });

    await expect(recoverAccountDeletionAfterStartup()).resolves.toBe(true);

    expect(deleteMeWithAccountAuth).toHaveBeenCalledTimes(1);
    expect(markAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: false });
    expect(clearAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('keeps local data and sync suppression when startup backend retry fails before marker', async () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('account_deletion');
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue({ accessToken: 'account.jwt' });
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Network down', { isNetworkError: true }),
    );

    await expect(recoverAccountDeletionAfterStartup()).rejects.toThrow('Network down');

    expect(markAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resumeSync).not.toHaveBeenCalled();
  });

  it('runs local cleanup when sync pause exists without marker and account session is missing', async () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('account_deletion');
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);

    await expect(recoverAccountDeletionAfterStartup()).resolves.toBe(true);

    expect(deleteMeWithAccountAuth).not.toHaveBeenCalled();
    expect(markAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: false });
    expect(clearAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('keeps marker and sync suppression when startup local cleanup fails', async () => {
    (getSyncPauseReason as jest.Mock).mockReturnValue('account_deletion');
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
    (resetToGuestBootstrap as jest.Mock).mockRejectedValueOnce(new Error('reset failed'));

    await expect(recoverAccountDeletionAfterStartup()).rejects.toThrow('reset failed');

    expect(markAccountDeletionCleanupPending).toHaveBeenCalledTimes(1);
    expect(clearAccountDeletionCleanupPending).not.toHaveBeenCalled();
    expect(resumeSync).not.toHaveBeenCalled();
  });
});

describe('getFriendlyAccountDeletionError', () => {
  it('maps session expiry to sign-in copy', () => {
    expect(getFriendlyAccountDeletionError(new ApiError('Unauthorized', { status: 401 }))).toBe(
      'Your session expired. Sign in again, then try deleting your account.',
    );
  });

  it('maps network errors to connection copy', () => {
    expect(
      getFriendlyAccountDeletionError(
        new ApiError('Network request failed', { isNetworkError: true }),
      ),
    ).toBe('Could not reach the server. Check your connection and try again.');
  });

  it('maps server errors to retry-later copy', () => {
    expect(getFriendlyAccountDeletionError(new ApiError('SQL exploded', { status: 500 }))).toBe(
      "We couldn't delete your account right now. Try again later.",
    );
  });

  it('does not expose raw unexpected error messages', () => {
    expect(getFriendlyAccountDeletionError(new Error('stack trace: SELECT * FROM secrets'))).toBe(
      'Something went wrong. Your local data was not removed.',
    );
  });
});
