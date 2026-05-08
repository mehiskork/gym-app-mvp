import { logEvent } from '../utils/logger';

const SYNC_DEBOUNCE_MS = 3000;
const FOREGROUND_SYNC_COOLDOWN_MS = 45000;
let scheduledSync: ReturnType<typeof setTimeout> | null = null;
let pendingReason: string | null = null;
let lastForegroundSyncAt = 0;

async function runScheduledSync(reason: string) {
  try {
    // Lazy-load to avoid a static outboxRepo -> scheduler -> syncWorker -> outboxRepo cycle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { syncNow } = require('./syncWorker') as typeof import('./syncWorker');
    await syncNow({ force: false });
  } catch (error) {
    logEvent('warn', 'sync', 'Scheduled sync failed', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleSyncSoon(reason: string): void {
  pendingReason = reason;
  if (scheduledSync) {
    return;
  }

  scheduledSync = setTimeout(() => {
    const reasonForRun = pendingReason ?? reason;
    scheduledSync = null;
    pendingReason = null;
    void runScheduledSync(reasonForRun);
  }, SYNC_DEBOUNCE_MS);
}

export function scheduleStartupSync(reason: string): void {
  lastForegroundSyncAt = Date.now();
  scheduleSyncSoon(reason);
}

export function scheduleForegroundSync(reason: string): void {
  const now = Date.now();
  if (now - lastForegroundSyncAt < FOREGROUND_SYNC_COOLDOWN_MS) {
    return;
  }

  lastForegroundSyncAt = now;
  scheduleSyncSoon(reason);
}

export function cancelScheduledSync(): void {
  if (scheduledSync) {
    clearTimeout(scheduledSync);
  }
  scheduledSync = null;
  pendingReason = null;
}

export function resetSyncSchedulerForTests(): void {
  cancelScheduledSync();
  lastForegroundSyncAt = 0;
}
