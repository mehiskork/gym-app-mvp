import { ApiError } from '../../api/errors';
import {
  deleteAccountAndResetLocalState,
  getFriendlyAccountDeletionError,
} from '../accountDeletion';
import { deleteMeWithAccountAuth } from '../../api/accountClient';
import { pauseSync, resumeSync } from '../../db/appMetaRepo';
import { resetToGuestBootstrap } from '../identityTransition';
import { signOutFromGoogle } from '../firebaseGoogleAuthClient';
import { cancelScheduledSync } from '../../sync/syncScheduler';
import { waitForInFlightSync } from '../../sync/syncWorker';

jest.mock('../../api/accountClient', () => ({
  deleteMeWithAccountAuth: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../db/appMetaRepo', () => ({
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
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
  waitForInFlightSync: jest.fn(() => Promise.resolve()),
}));

describe('deleteAccountAndResetLocalState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteMeWithAccountAuth as jest.Mock).mockResolvedValue(undefined);
    (resetToGuestBootstrap as jest.Mock).mockResolvedValue(undefined);
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (waitForInFlightSync as jest.Mock).mockResolvedValue(undefined);
  });

  it('pauses sync, waits for in-flight sync, deletes server account, then resets local state', async () => {
    await deleteAccountAndResetLocalState();

    expect(pauseSync).toHaveBeenCalledWith('account_deletion');
    expect(cancelScheduledSync).toHaveBeenCalledTimes(1);
    expect(waitForInFlightSync).toHaveBeenCalledTimes(1);
    expect(deleteMeWithAccountAuth).toHaveBeenCalledTimes(1);
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledTimes(1);
    expect(resumeSync).not.toHaveBeenCalled();
  });

  it('does not clear local state when backend deletion fails and resumes sync', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Network down', { isNetworkError: true }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow('Network down');

    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
    expect(resumeSync).toHaveBeenCalledTimes(1);
  });

  it('does not reset local state when DELETE /me returns a non-204 2xx response', async () => {
    (deleteMeWithAccountAuth as jest.Mock).mockRejectedValueOnce(
      new ApiError('Unexpected response status 200', { status: 200 }),
    );

    await expect(deleteAccountAndResetLocalState()).rejects.toThrow(
      'Unexpected response status 200',
    );

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
