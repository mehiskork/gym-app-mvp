import { api } from '../api/client';
import { getMeWithAccessToken } from '../api/accountClient';
import {
  getClaimedUserId,
  pauseSync,
  resumeSync,
  setClaimed,
  setClaimedUserId,
} from '../db/appMetaRepo';
import { listPendingOutboxOps } from '../db/outboxRepo';
import { syncNow } from '../sync/syncWorker';
import { accountSessionStore } from './accountSessionStore';
import {
  buildFirebaseAccountSession,
  signInWithGoogleForFirebase,
  signOutFromGoogle,
} from './firebaseGoogleAuthClient';
import { resolveLocalAccountState } from './localAccountState';

type ClaimStartResponse = {
  code: string;
};

type ClaimConfirmResponse = {
  guestUserId: string;
  userId: string;
  status: string;
};

export type GoogleAccountSignInResult = {
  userId: string;
  email?: string;
  displayName?: string;
};

async function assertGuestOutboxDrained(): Promise<void> {
  await syncNow({ force: true });
  if (listPendingOutboxOps(1).length > 0) {
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

    const claimConfirm = await api.post<ClaimConfirmResponse>(
      '/claim/confirm',
      { code: claimStart.code },
      { headers: { Authorization: `Bearer ${accountSession.accessToken}` } },
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

    result = {
      userId: claimConfirm.userId,
      email: accountSession.email,
      displayName: accountSession.displayName,
    };
  } catch (error) {
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
    const currentClaimedUserId = getClaimedUserId();

    if (!currentClaimedUserId) {
      throw new Error(
        'This device is linked but is missing its account owner. Reset this device before signing in.',
      );
    }
    if (currentClaimedUserId !== me.externalAccountId) {
      throw new Error(
        'Different account detected. Sign out and reset local data before switching accounts.',
      );
    }

    await accountSessionStore.set(accountSession);
    sessionStored = true;
    setClaimed(true);
    setClaimedUserId(me.externalAccountId);

    await syncAfterAccountAuth();

    return {
      userId: me.externalAccountId,
      email: accountSession.email,
      displayName: accountSession.displayName,
    };
  } catch (error) {
    if (!sessionStored) {
      await signOutFromGoogle().catch(() => undefined);
    }
    throw error;
  }
}
