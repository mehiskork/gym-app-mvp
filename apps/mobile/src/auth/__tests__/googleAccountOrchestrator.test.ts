import { createGoogleAccountFromGuest, reconnectGoogleAccount } from '../googleAccountOrchestrator';
import { api } from '../../api/client';
import { ApiError } from '../../api/errors';
import { getMeWithAccessToken } from '../../api/accountClient';
import {
  getClaimedUserId,
  isLinkedAccountState,
  setClaimed,
  setClaimedUserId,
} from '../../db/appMetaRepo';
import { listNonAckedOutboxOps, repairStaleInFlightOps } from '../../db/outboxRepo';
import { resetSyncCursor } from '../../db/syncStateRepo';
import { syncNow } from '../../sync/syncWorker';
import { accountSessionStore } from '../accountSessionStore';
import { deviceCredentialStore } from '../deviceCredentialStore';
import { signInWithGoogleForFirebase, signOutFromGoogle } from '../firebaseGoogleAuthClient';
import { handleRemoteAccountDeletedCleanup } from '../remoteAccountDeletion';

jest.mock('../../api/client', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('../../api/accountClient', () => ({
  getMeWithAccessToken: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getClaimedUserId: jest.fn(() => null),
  isLinkedAccountState: jest.fn(() => false),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
  setClaimed: jest.fn(),
  setClaimedUserId: jest.fn(),
}));

jest.mock('../../db/outboxRepo', () => ({
  listNonAckedOutboxOps: jest.fn(),
  repairStaleInFlightOps: jest.fn(),
}));

jest.mock('../../db/syncStateRepo', () => ({
  resetSyncCursor: jest.fn(),
}));

jest.mock('../../sync/syncWorker', () => ({
  syncNow: jest.fn(),
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    getUsable: jest.fn(),
    invalidate: jest.fn(() => Promise.resolve()),
    set: jest.fn(),
  },
}));

jest.mock('../deviceCredentialStore', () => ({
  deviceCredentialStore: {
    getDeviceToken: jest.fn(),
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

jest.mock('../remoteAccountDeletion', () => ({
  handleRemoteAccountDeletedCleanup: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

describe('createGoogleAccountFromGuest', () => {
  const unresolvedOutboxOp = (status: string) => ({
    op_id: `op-${status}`,
    status,
  });

  async function expectClaimBlockedByOutbox(status: string) {
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([unresolvedOutboxOp(status)]);

    await expect(createGoogleAccountFromGuest()).rejects.toThrow(
      'Sync pending changes before creating an account.',
    );

    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(api.post).not.toHaveBeenCalled();
    expect(signInWithGoogleForFirebase).not.toHaveBeenCalled();
    expect(deviceCredentialStore.getDeviceToken).not.toHaveBeenCalled();
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(setClaimed).not.toHaveBeenCalled();
    expect(setClaimedUserId).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([]);
    (repairStaleInFlightOps as jest.Mock).mockReturnValue(0);
    (isLinkedAccountState as jest.Mock).mockReturnValue(false);
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue(null);
    (handleRemoteAccountDeletedCleanup as jest.Mock).mockResolvedValue(undefined);
    (deviceCredentialStore.getDeviceToken as jest.Mock).mockResolvedValue('device-token-123');
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
      recreated: false,
    });
    (getMeWithAccessToken as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'firebase-uid',
      externalAccountId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    });
  });

  it('drains guest outbox, confirms claim, then stores the Firebase account session', async () => {
    await expect(createGoogleAccountFromGuest()).resolves.toEqual({
      userId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      email: 'user@example.test',
      displayName: 'Test User',
    });

    expect(syncNow).toHaveBeenCalledWith({ force: true });
    expect(syncNow).toHaveBeenCalledTimes(2);
    expect(repairStaleInFlightOps).toHaveBeenCalledWith(120);
    expect(repairStaleInFlightOps).toHaveBeenCalledTimes(2);
    expect(listNonAckedOutboxOps).toHaveBeenCalledWith(1);
    expect(api.post).toHaveBeenNthCalledWith(1, '/claim/start');
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/claim/confirm',
      { code: 'CLAIM123' },
      {
        headers: {
          Authorization: 'Bearer firebase-id-token',
          'X-Device-Authorization': 'Bearer device-token-123',
        },
      },
    );
    expect((api.post as jest.Mock).mock.invocationCallOrder[1]).toBeLessThan(
      (accountSessionStore.set as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((accountSessionStore.set as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (resetSyncCursor as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((resetSyncCursor as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (syncNow as jest.Mock).mock.invocationCallOrder[1],
    );
    expect(resetSyncCursor).toHaveBeenCalledTimes(1);
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
    expect(getMeWithAccessToken).toHaveBeenCalledWith('firebase-id-token');
  });

  it('treats recreated claim response as normal signed-in state', async () => {
    (api.post as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ code: 'CLAIM123' })
      .mockResolvedValueOnce({
        guestUserId: 'guest-1',
        userId: 'account|new-generation',
        status: 'claimed',
        recreated: true,
      });
    (getMeWithAccessToken as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'firebase-uid',
      externalAccountId: 'account|new-generation',
      activeAccountOwnerId: 'account|new-generation',
    });

    await expect(createGoogleAccountFromGuest()).resolves.toEqual({
      userId: 'account|new-generation',
      email: 'user@example.test',
      displayName: 'Test User',
    });

    expect(setClaimed).toHaveBeenCalledWith(true);
    expect(setClaimedUserId).toHaveBeenCalledWith('account|new-generation');
    expect(accountSessionStore.set).toHaveBeenCalledTimes(1);
    expect(signOutFromGoogle).not.toHaveBeenCalled();
  });

  it('keeps the linked account session when automatic account sync fails after claim', async () => {
    (syncNow as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('sync failed'));

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('sync failed');

    expect(accountSessionStore.set).toHaveBeenCalledTimes(1);
    expect(setClaimed).toHaveBeenCalledWith(true);
    expect(setClaimedUserId).toHaveBeenCalledWith(
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    );
    expect(resetSyncCursor).toHaveBeenCalledTimes(1);
    expect(signOutFromGoogle).not.toHaveBeenCalled();
  });

  it('does not store account session if claim confirm fails', async () => {
    (api.post as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ code: 'CLAIM123' })
      .mockRejectedValueOnce(new Error('CLAIM_INVALID'));

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('CLAIM_INVALID');

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it('uses generic sign-in failure and invalidates attempted account session when claim confirm returns ACCOUNT_DELETED', async () => {
    (api.post as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ code: 'CLAIM123' })
      .mockRejectedValueOnce(
        new ApiError('TrainFrame account was deleted', {
          status: 410,
          code: 'ACCOUNT_DELETED',
          requestId: 'req-1',
          details: null,
        }),
      );

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('Google account sign-in failed.');

    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('claim_account_deleted_remote');
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(setClaimed).not.toHaveBeenCalled();
    expect(setClaimedUserId).not.toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalledTimes(2);
    expect(syncNow).toHaveBeenNthCalledWith(1, { force: true });
    expect(syncNow).toHaveBeenNthCalledWith(2, { force: true });
  });

  it('does not store account session if the device token is missing after account auth', async () => {
    (deviceCredentialStore.getDeviceToken as jest.Mock).mockResolvedValue(null);

    await expect(createGoogleAccountFromGuest()).rejects.toThrow(
      'Device credential missing. Restart account linking from this device.',
    );

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/claim/start');
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it('does not store account session if Google or Firebase sign-in fails', async () => {
    (signInWithGoogleForFirebase as jest.Mock).mockRejectedValue(
      new Error('Firebase token exchange failed.'),
    );

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('Firebase token exchange failed.');

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
  });

  it('uses the existing forced sync drain path for due pending guest work before allowing claim', async () => {
    await expect(createGoogleAccountFromGuest()).resolves.toEqual(
      expect.objectContaining({
        userId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      }),
    );

    expect((syncNow as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (listNonAckedOutboxOps as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(api.post).toHaveBeenCalledWith('/claim/start');
  });

  it('stops before claim start when due pending guest outbox cannot drain', async () => {
    await expectClaimBlockedByOutbox('pending');
  });

  it('stops before claim start when delayed failed guest outbox remains', async () => {
    await expectClaimBlockedByOutbox('failed');
  });

  it('stops before claim start when fresh in-flight guest outbox remains after stale repair', async () => {
    await expectClaimBlockedByOutbox('in_flight');
  });

  it('stops before claim start when dead guest outbox remains', async () => {
    await expectClaimBlockedByOutbox('dead');
  });

  it('stops before claim start when any other non-acked guest outbox status remains', async () => {
    await expectClaimBlockedByOutbox('paused');
  });

  it('leaves guest local state intact when claim is blocked by unresolved outbox', async () => {
    (listNonAckedOutboxOps as jest.Mock).mockReturnValue([unresolvedOutboxOp('dead')]);

    await expect(createGoogleAccountFromGuest()).rejects.toThrow(
      'Sync pending changes before creating an account.',
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(signInWithGoogleForFirebase).not.toHaveBeenCalled();
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(setClaimed).not.toHaveBeenCalled();
    expect(setClaimedUserId).not.toHaveBeenCalled();
  });

  it('stops before claim start when local state is already linked but account session is unavailable', async () => {
    (isLinkedAccountState as jest.Mock).mockReturnValue(true);

    await expect(createGoogleAccountFromGuest()).rejects.toThrow(
      'This device is already linked. Reauth or reset local data before using a different Google account.',
    );

    expect(syncNow).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(signInWithGoogleForFirebase).not.toHaveBeenCalled();
    expect(accountSessionStore.set).not.toHaveBeenCalled();
  });

  it('/me failure after claim confirm leaves linked local state without storing session', async () => {
    (getMeWithAccessToken as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    await expect(createGoogleAccountFromGuest()).rejects.toThrow('Unauthorized');

    expect(setClaimed).toHaveBeenCalledWith(true);
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(getMeWithAccessToken).toHaveBeenCalledWith('firebase-id-token');
  });
});

describe('reconnectGoogleAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (syncNow as jest.Mock).mockResolvedValue(undefined);
    (isLinkedAccountState as jest.Mock).mockReturnValue(true);
    (getClaimedUserId as jest.Mock).mockReturnValue(
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    );
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
    (getMeWithAccessToken as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'firebase-uid',
      externalAccountId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    });
  });

  it('refreshes a linked account session and triggers account sync without claim endpoints', async () => {
    await expect(reconnectGoogleAccount()).resolves.toEqual({
      userId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      email: 'user@example.test',
      displayName: 'Test User',
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(deviceCredentialStore.getDeviceToken).not.toHaveBeenCalled();
    expect(getMeWithAccessToken).toHaveBeenCalledWith('firebase-id-token');
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
    expect(syncNow).toHaveBeenCalledWith({ force: true });
  });

  it('uses active account owner from /me when reconnecting a recreated account', async () => {
    (getClaimedUserId as jest.Mock).mockReturnValue('account|new-generation');
    (getMeWithAccessToken as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'firebase-uid',
      externalAccountId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
      activeAccountOwnerId: 'account|new-generation',
    });

    await expect(reconnectGoogleAccount()).resolves.toEqual({
      userId: 'account|new-generation',
      email: 'user@example.test',
      displayName: 'Test User',
    });

    expect(setClaimedUserId).toHaveBeenCalledWith('account|new-generation');
    expect(accountSessionStore.set).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect from true guest state', async () => {
    (isLinkedAccountState as jest.Mock).mockReturnValue(false);

    await expect(reconnectGoogleAccount()).rejects.toThrow(
      'This device is not linked. Use Continue with Google to create an account.',
    );

    expect(signInWithGoogleForFirebase).not.toHaveBeenCalled();
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('does not reconnect if Google signs in as a different account', async () => {
    (getMeWithAccessToken as jest.Mock).mockResolvedValue({
      principalType: 'account',
      subject: 'other-uid',
      externalAccountId: 'https://securetoken.google.com/gym-app-mvp-1d7f0|other-uid',
    });

    await expect(reconnectGoogleAccount()).rejects.toThrow(
      'Different account detected. Sign out and reset local data before switching accounts.',
    );

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('leaves linked reauth state safe when reconnect /me verification fails', async () => {
    (getMeWithAccessToken as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    await expect(reconnectGoogleAccount()).rejects.toThrow('Unauthorized');

    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('runs remote deletion cleanup when reconnect /me returns ACCOUNT_DELETED', async () => {
    (getMeWithAccessToken as jest.Mock).mockRejectedValue(
      new ApiError('TrainFrame account was deleted', {
        status: 410,
        code: 'ACCOUNT_DELETED',
        requestId: 'req-1',
      }),
    );

    await expect(reconnectGoogleAccount()).rejects.toThrow('Google account sign-in failed.');

    expect(handleRemoteAccountDeletedCleanup).toHaveBeenCalledTimes(1);
    expect(accountSessionStore.set).not.toHaveBeenCalled();
    expect(setClaimed).not.toHaveBeenCalled();
    expect(setClaimedUserId).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
  });
});
