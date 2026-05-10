import { accountSessionStore } from './accountSessionStore';
import { signOutFromGoogle } from './firebaseGoogleAuthClient';
import { resetToGuestBootstrap } from './identityTransition';
import { pauseSync } from '../db/appMetaRepo';
import { cancelScheduledSync } from '../sync/syncScheduler';
import { logEvent } from '../utils/logger';

export async function handleRemoteAccountDeletedCleanup(): Promise<void> {
  pauseSync('account_deletion');
  cancelScheduledSync();
  await accountSessionStore.invalidate('account_deleted_remote').catch(() => undefined);
  await signOutFromGoogle().catch(() => undefined);
  await resetToGuestBootstrap({ resumeSyncAfterReset: true });
  writeRemoteAccountDeletedCleanupDiagnostic();
}

function writeRemoteAccountDeletedCleanupDiagnostic(): void {
  try {
    logEvent('warn', 'auth', 'Remote account deletion cleanup completed', {
      reason: 'account_deleted_remote',
    });
  } catch {
    // Cleanup has already succeeded. Diagnostics must not put the app back into account state.
  }
}
