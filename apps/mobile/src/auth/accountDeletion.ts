import { ApiError } from '../api/errors';
import { deleteMeWithAccountAuth } from '../api/accountClient';
import { pauseSync, resumeSync } from '../db/appMetaRepo';
import { resetToGuestBootstrap } from './identityTransition';
import { signOutFromGoogle } from './firebaseGoogleAuthClient';
import { cancelScheduledSync } from '../sync/syncScheduler';
import { waitForInFlightSync } from '../sync/syncWorker';

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

export async function deleteAccountAndResetLocalState(): Promise<void> {
  pauseSync('account_deletion');
  cancelScheduledSync();
  let backendDeleted = false;

  try {
    await waitForInFlightSync();
    await deleteMeWithAccountAuth();
    backendDeleted = true;

    // Backend deletion succeeded. Local cleanup must now remove stale account data
    // before normal sync resumes, because the backend has no account tombstone.
    await signOutFromGoogle().catch(() => undefined);
    await resetToGuestBootstrap();
  } catch (error) {
    if (!backendDeleted) {
      resumeSync();
    }
    throw error;
  }
}
