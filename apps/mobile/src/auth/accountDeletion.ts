import { ApiError } from '../api/errors';
import { deleteMeWithAccountAuth } from '../api/accountClient';
import { getSyncPauseReason, pauseSync, resumeSync } from '../db/appMetaRepo';
import { resetToGuestBootstrap } from './identityTransition';
import { signOutFromGoogle } from './firebaseGoogleAuthClient';
import { cancelScheduledSync } from '../sync/syncScheduler';
import { quiesceSyncBeforeIdentityReset } from './syncQuiescence';
import { accountSessionStore } from './accountSessionStore';
import {
  clearAccountDeletionCleanupPending,
  isAccountDeletionCleanupPending,
  markAccountDeletionCleanupPending,
} from './accountDeletionCleanupMarker';

type DeleteAccountOptions = {
  resumeSyncOnBackendFailure?: boolean;
};

export function getFriendlyAccountDeletionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Your session expired. Sign in again, then try deleting your account.';
    }
    if (error.isNetworkError || error.isTimeout) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    if (typeof error.status === 'number' && error.status >= 500) {
      return "We couldn't delete your account right now. Try again later.";
    }
    return 'Something went wrong. Your local data was not removed.';
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('no account session') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('expired')
  ) {
    return 'Your session expired. Sign in again, then try deleting your account.';
  }
  if (message.includes('network') || message.includes('offline') || message.includes('timeout')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return 'Something went wrong. Your local data was not removed.';
}

export async function deleteAccountAndResetLocalState({
  resumeSyncOnBackendFailure = true,
}: DeleteAccountOptions = {}): Promise<void> {
  await quiesceSyncBeforeIdentityReset('account_deletion');
  let backendDeleted = false;

  try {
    await deleteMeWithAccountAuth();
    backendDeleted = true;
    await markAccountDeletionCleanupPending();

    await finishAccountDeletionLocalCleanup();
  } catch (error) {
    if (!backendDeleted && resumeSyncOnBackendFailure) {
      resumeSync();
    }
    throw error;
  }
}

async function finishAccountDeletionLocalCleanup(): Promise<void> {
  pauseSync('account_deletion');
  cancelScheduledSync();

  // Backend deletion already succeeded and writes a tombstone that blocks stale
  // authenticated replay. Local cleanup still removes this install's account data
  // before normal guest sync resumes.
  await signOutFromGoogle().catch(() => undefined);
  await resetToGuestBootstrap({ resumeSyncAfterReset: false });
  await clearAccountDeletionCleanupPending();
  resumeSync();
}

export async function recoverPendingAccountDeletionCleanup(): Promise<boolean> {
  if (!(await isAccountDeletionCleanupPending())) {
    return false;
  }

  await finishAccountDeletionLocalCleanup();
  return true;
}

export async function hasPendingAccountDeletionCleanupMarker(): Promise<boolean> {
  return isAccountDeletionCleanupPending();
}

export async function hasPendingAccountDeletionRecovery(): Promise<boolean> {
  return getSyncPauseReason() === 'account_deletion' || (await isAccountDeletionCleanupPending());
}

export async function recoverAccountDeletionAfterStartup(): Promise<boolean> {
  if (await isAccountDeletionCleanupPending()) {
    await finishAccountDeletionLocalCleanup();
    return true;
  }

  if (getSyncPauseReason() !== 'account_deletion') {
    return false;
  }

  const accountSession = await accountSessionStore.getUsable().catch(() => null);
  if (accountSession?.accessToken) {
    await deleteAccountAndResetLocalState({ resumeSyncOnBackendFailure: false });
    return true;
  }

  await markAccountDeletionCleanupPending();
  await finishAccountDeletionLocalCleanup();
  return true;
}
