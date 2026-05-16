import { api } from '../api/client';
import { isAccountDeletedApiError } from '../api/errors';
import { getMeWithAccessToken } from '../api/accountClient';
import {
  getClaimedUserId,
  pauseSync,
  resumeSync,
  setClaimed,
  setClaimedUserId,
} from '../db/appMetaRepo';
import { listNonAckedOutboxOps, repairStaleInFlightOps } from '../db/outboxRepo';
import { resetSyncCursor } from '../db/syncStateRepo';
import { OUTBOX_STALE_IN_FLIGHT_SECONDS } from '../sync/constants';
import { syncNow } from '../sync/syncWorker';
import { accountSessionStore } from './accountSessionStore';
import { deviceCredentialStore } from './deviceCredentialStore';
import {
  buildFirebaseAccountSession,
  signInWithGoogleForFirebase,
  signOutFromGoogle,
} from './firebaseGoogleAuthClient';
import { resolveLocalAccountState } from './localAccountState';
import { handleRemoteAccountDeletedCleanup } from './remoteAccountDeletion';
import { logEvent } from '../utils/logger';

type ClaimStartResponse = {
  code: string;
};

type ClaimConfirmResponse = {
  guestUserId: string;
  userId: string;
  status: string;
  recreated?: boolean;
};

export type GoogleAccountSignInResult = {
  userId: string;
  email?: string;
  displayName?: string;
};

async function assertGuestOutboxDrained(): Promise<void> {
  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  await syncNow({ force: true });
  repairStaleInFlightOps(OUTBOX_STALE_IN_FLIGHT_SECONDS);
  if (listNonAckedOutboxOps(1).length > 0) {
    throw new Error('Sync pending changes before creating an account.');
  }
}

async function syncAfterAccountAuth(): Promise<void> {
  await syncNow({ force: true });
}

export async function createGoogleAccountFromGuest(): Promise<GoogleAccountSignInResult> {
  const localAccountState = await resolveLocalAccountState();
  if (localAccountState.status !== 'guest') {
    throw new Error(
      'This device is already linked. Reauth or reset local data before using a different Google account.',
    );
  }

  await assertGuestOutboxDrained();
  pauseSync('claim');

  let result: GoogleAccountSignInResult | null = null;
  let sessionStored = false;
  try {
    const claimStart = await api.post<ClaimStartResponse>('/claim/start');
    const { firebaseSession } = await signInWithGoogleForFirebase();
    const accountSession = buildFirebaseAccountSession(firebaseSession);
    const deviceToken = await deviceCredentialStore.getDeviceToken();
    if (!deviceToken) {
      throw new Error('Device credential missing. Restart account linking from this device.');
    }

    const claimConfirm = await api.post<ClaimConfirmResponse>(
      '/claim/confirm',
      { code: claimStart.code },
      {
        headers: {
          Authorization: `Bearer ${accountSession.accessToken}`,
          'X-Device-Authorization': `Bearer ${deviceToken}`,
        },
      },
    );

    const currentClaimedUserId = getClaimedUserId();
    if (currentClaimedUserId && currentClaimedUserId !== claimConfirm.userId) {
      throw new Error(
        'Different account detected. Sign out and reset local data before switching accounts.',
      );
    }

    setClaimed(true);
    setClaimedUserId(claimConfirm.userId);
    await getMeWithAccessToken(accountSession.accessToken);
    await accountSessionStore.set(accountSession);
    sessionStored = true;
    resetSyncCursor();

    result = {
      userId: claimConfirm.userId,
      email: accountSession.email,
      displayName: accountSession.displayName,
    };
  } catch (error) {
    if (isAccountDeletedApiError(error)) {
      await accountSessionStore.invalidate('claim_account_deleted_remote').catch(() => undefined);
      await signOutFromGoogle().catch(() => undefined);
      logEvent('warn', 'auth', 'Claim confirm rejected by account deletion tombstone', {
        reason: 'account_deleted_remote',
      });
      resumeSync();
      await syncNow({ force: true }).catch(() => undefined);
      throw new Error('Google account sign-in failed.');
    }
    if (!sessionStored) {
      await signOutFromGoogle().catch(() => undefined);
    }
    throw error;
  } finally {
    resumeSync();
  }

  if (!result) {
    throw new Error('Google account sign-in did not complete.');
  }

  await syncAfterAccountAuth();
  return result;
}

export async function reconnectGoogleAccount(): Promise<GoogleAccountSignInResult> {
  const localAccountState = await resolveLocalAccountState();
  if (localAccountState.status === 'guest') {
    throw new Error('This device is not linked. Use Continue with Google to create an account.');
  }
  if (localAccountState.status === 'linked_with_usable_account') {
    throw new Error('This device is already signed in.');
  }

  let sessionStored = false;
  try {
    const { firebaseSession } = await signInWithGoogleForFirebase();
    const accountSession = buildFirebaseAccountSession(firebaseSession);
    const me = await getMeWithAccessToken(accountSession.accessToken);
    const activeOwnerId = me.activeAccountOwnerId ?? me.externalAccountId;
    const currentClaimedUserId = getClaimedUserId();

    if (!currentClaimedUserId) {
      throw new Error(
        'This device is linked but is missing its account owner. Reset this device before signing in.',
      );
    }
    if (currentClaimedUserId !== activeOwnerId) {
      throw new Error(
        'Different account detected. Sign out and reset local data before switching accounts.',
      );
    }

    await accountSessionStore.set(accountSession);
    sessionStored = true;
    setClaimed(true);
    setClaimedUserId(activeOwnerId);

    await syncAfterAccountAuth();

    return {
      userId: activeOwnerId,
      email: accountSession.email,
      displayName: accountSession.displayName,
    };
  } catch (error) {
    if (isAccountDeletedApiError(error)) {
      await handleRemoteAccountDeletedCleanup();
      throw new Error('Google account sign-in failed.');
    }
    if (!sessionStored) {
      await signOutFromGoogle().catch(() => undefined);
    }
    throw error;
  }
}
