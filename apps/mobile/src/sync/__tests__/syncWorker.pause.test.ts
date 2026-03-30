// @ts-nocheck
import { syncNow } from '../syncWorker';
import { claimOutboxOps } from '../../db/outboxRepo';
import { isSyncPaused } from '../../db/appMetaRepo';
import { logEvent } from '../../utils/logger';

jest.mock('../../db/appMetaRepo', () => ({
  isSyncPaused: jest.fn(() => true),
}));

jest.mock('../../db/outboxRepo', () => ({
  claimOutboxOps: jest.fn(),
  markOutboxOpsAcked: jest.fn(),
  markOutboxOpsFailed: jest.fn(),
  repairStaleInFlightOps: jest.fn(),
}));

jest.mock('../../db/syncStateRepo', () => ({
  getSyncState: jest.fn(() => ({ cursor: '0', backoff_until: null, consecutive_failures: 0 })),
  normalizeCursor: jest.fn((cursor: string) => cursor),
  updateSyncState: jest.fn(),
}));

jest.mock('../../db/syncRunRepo', () => ({
  createSyncRun: jest.fn(() => 'run-1'),
  finishSyncRun: jest.fn(),
}));

jest.mock('../../db/tx', () => ({
  inTransaction: jest.fn((fn: () => void) => fn()),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

jest.mock('../applyDeltas', () => ({
  applyDeltas: jest.fn(() => ({ applied: 0, skipped: 0, total: 0 })),
}));

describe('syncNow pause guard', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns early when sync is paused', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    await syncNow();

    expect(isSyncPaused).toHaveBeenCalled();
    expect(claimOutboxOps).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith('info', 'sync', 'Sync paused', { reason: 'claim' });
  });
});
