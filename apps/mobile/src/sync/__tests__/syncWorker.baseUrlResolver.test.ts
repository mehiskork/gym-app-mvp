
jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://shared-resolver.example.test'),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getEffectiveUserId: jest.fn(() => 'user-1'),
  getGuestUserId: jest.fn(() => null),
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
  isSyncPaused: jest.fn(() => false),
  setLastSyncAckSummary: jest.fn(),
  setGuestUserId: jest.fn(),
}));

jest.mock('../../auth/deviceCredentialStore', () => ({
  deviceCredentialStore: {
    getDeviceToken: jest.fn(async () => 'device-token'),
    getOrCreateDeviceSecret: jest.fn(async () => 'secret-1'),
    setDeviceToken: jest.fn(async () => undefined),
  },
}));

jest.mock('../../db/outboxRepo', () => ({
  claimOutboxOps: jest.fn(() => []),
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

const { syncNow } = require('../syncWorker');
const { getApiBaseUrl } = require('../../api/config');


describe('syncWorker base URL resolver usage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses getApiBaseUrl for sync requests', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [],
        deltas: [],
        cursor: '1',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(getApiBaseUrl).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://shared-resolver.example.test/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
