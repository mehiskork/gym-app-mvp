import { getSecureStoreModule } from './secureStore';

const ACCOUNT_DELETION_CLEANUP_PENDING_KEY = 'account_deletion_cleanup_pending_v1';

type AccountDeletionCleanupPendingMarker = {
  pending: true;
  version: 1;
  markedAt: string;
};

export async function markAccountDeletionCleanupPending(): Promise<void> {
  const marker: AccountDeletionCleanupPendingMarker = {
    pending: true,
    version: 1,
    markedAt: new Date().toISOString(),
  };
  await getSecureStoreModule().setItemAsync(
    ACCOUNT_DELETION_CLEANUP_PENDING_KEY,
    JSON.stringify(marker),
  );
}

export async function clearAccountDeletionCleanupPending(): Promise<void> {
  await getSecureStoreModule().deleteItemAsync(ACCOUNT_DELETION_CLEANUP_PENDING_KEY);
}

export async function isAccountDeletionCleanupPending(): Promise<boolean> {
  return (await getSecureStoreModule().getItemAsync(ACCOUNT_DELETION_CLEANUP_PENDING_KEY)) !== null;
}
