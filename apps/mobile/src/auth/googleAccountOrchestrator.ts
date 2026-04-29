import { api } from '../api/client';
import { getMeWithAccountAuth } from '../api/accountClient';
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

export async function createGoogleAccountFromGuest(): Promise<GoogleAccountSignInResult> {
  const localAccountState = await resolveLocalAccountState();
  if (localAccountState.status !== 'guest') {
    throw new Error(
      'This device is already linked. Reauth or reset local data before using a different Google account.',
    );
  }

  await assertGuestOutboxDrained();
  pauseSync('claim');

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

    await accountSessionStore.set(accountSession);
    sessionStored = true;
    setClaimed(true);
    setClaimedUserId(claimConfirm.userId);

    await getMeWithAccountAuth();

    return {
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
}
