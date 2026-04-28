import { createGoogleAccountFromGuest } from '../googleAccountOrchestrator';
import { api } from '../../api/client';
import { getMeWithAccountAuth } from '../../api/accountClient';
import { setClaimed, setClaimedUserId } from '../../db/appMetaRepo';
import { listPendingOutboxOps } from '../../db/outboxRepo';
import { syncNow } from '../../sync/syncWorker';
import { accountSessionStore } from '../accountSessionStore';
import { signInWithGoogleForFirebase, signOutFromGoogle } from '../firebaseGoogleAuthClient';

jest.mock('../../api/client', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('../../api/accountClient', () => ({
  getMeWithAccountAuth: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getClaimedUserId: jest.fn(() => null),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
  setClaimed: jest.fn(),
  setClaimedUserId: jest.fn(),
}));

jest.mock('../../db/outboxRepo', () => ({
  listPendingOutboxOps: jest.fn(),
}));

jest.mock('../../sync/syncWorker', () => ({
  syncNow: jest.fn(),
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    getUsable: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../firebaseGoogleAuthClient', () => ({
  buildFirebaseAccountSession: jest.fn((input) => ({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    subject: input.localId,
    issuer: 'https://securetoken.google.com/gym-app-mvp-1d7f0',
    expiresAt: input.expiresAt,
    email: input.email,
    displayName: input.displayName,
    provider: 'firebase_google',
  })),
  signInWithGoogleForFirebase: jest.fn(),
  signOutFromGoogle: jest.fn(),
}));

describe('createGoogleAccountFromGuest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (listPendingOutboxOps as jest.Mock).mockReturnValue([]);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
    (signInWithGoogleForFirebase as jest.Mock).mockResolvedValue({
      googleIdToken: 'google-id-token',
      firebaseSession: {
        accessToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
        localId: 'firebase-uid',
        expiresAt: '2026-04-28T13:00:00.000Z',
        email: 'user@example.test',
        displayName: 'Test User',
      },
    });
    (signOutFromGoogle as jest.Mock).mockResolvedValue(undefined);
    (api.post as jest.Mock).mockResolvedValueOnce({ code: 'CLAIM123' }).mockResolvedValueOnce({
      guestUserId: 'guest-1',
      userId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      status: 'claimed',
    });
    (getMeWithAccountAuth as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'firebase-uid',
    });
  });

  it('drains guest outbox, confirms claim, then stores the Firebase account session', async () => {
    await expect(createGoogleAccountFromGuest()).resolves.toEqual({
      userId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      email: 'user@example.test',
      displayName: 'Test User',
    });

    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(api.post).toHaveBeenNthCalledWith(1, '/claim/start');
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/claim/confirm',
      { code: 'CLAIM123' },
      { headers: { Authorization: 'Bearer firebase-id-token' } },
    );
    expect((api.post as jest.Mock).mock.invocationCallOrder[1]).toBeLessThan(
      (accountSessionStore.set as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(accountSessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
        subject: 'firebase-uid',
      }),
    );
    expect(setClaimed).toHaveBeenCalledWith(true);
    expect(setClaimedUserId).toHaveBeenCalledWith(
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    );
    expect(getMeWithAccountAuth).toHaveBeenCalledTimes(1);
  });

  it('does not store account session if claim confirm fails', async () => {
    (api.post as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ code: 'CLAIM123' })
      .mockRejectedValueOnce(new Error('CLAIM_INVALID'));

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('CLAIM_INVALID');

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it('does not store account session if Google or Firebase sign-in fails', async () => {
    (signInWithGoogleForFirebase as jest.Mock).mockRejectedValue(
      new Error('Firebase token exchange failed.'),
    );

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('Firebase token exchange failed.');

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it('stops before claim start when guest outbox cannot drain', async () => {
    (listPendingOutboxOps as jest.Mock).mockReturnValue([{ op_id: 'op-1' }]);

    await expect(createGoogleAccountFromGuest()).rejects.toThrow(
      'Sync pending changes before creating an account.',
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(signInWithGoogleForFirebase).not.toHaveBeenCalled();
    expect(accountSessionStore.set).not.toHaveBeenCalled();
  });

  it('/me 401 after claim confirm invalidates through the existing account client path', async () => {
    (getMeWithAccountAuth as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('Unauthorized');

    expect(accountSessionStore.set).toHaveBeenCalledTimes(1);
    expect(getMeWithAccountAuth).toHaveBeenCalledTimes(1);
  });
});
