// @ts-nocheck

jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://example.test'),
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
  claimOutboxOps: jest.fn(),
  markOutboxOpsAcked: jest.fn(),
  markOutboxOpsFailed: jest.fn(),
  repairStaleInFlightOps: jest.fn(),
}));

let mockSyncState = {
  cursor: '0',
  backoff_until: null as string | null,
  consecutive_failures: 0,
};

jest.mock('../../db/syncStateRepo', () => ({
  getSyncState: jest.fn(() => mockSyncState),
  normalizeCursor: jest.fn((cursor: string) => cursor),
  updateSyncState: jest.fn((update: Record<string, unknown>) => {
    mockSyncState = { ...mockSyncState, ...update };
  }),
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
  applyDeltas: jest.fn((deltas) => ({ applied: deltas.length, skipped: 0, total: deltas.length })),
}));

const { syncNow } = require('../syncWorker');
const { applyDeltas } = require('../applyDeltas');
const { claimOutboxOps } = require('../../db/outboxRepo');
const { getSyncState, updateSyncState } = require('../../db/syncStateRepo');

describe('syncNow hasMore paging loop', () => {
  beforeEach(() => {
    mockSyncState = { cursor: '0', backoff_until: null, consecutive_failures: 0 };
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('pages pull-only requests in-order until hasMore is false and advances cursor each page', async () => {
    const pages = [
      {
        cursor: '1000',
        hasMore: true,
        deltas: [{ entityType: 'exercise', entityId: '1', opType: 'upsert', payload: {} }],
      },
      {
        cursor: '2000',
        hasMore: true,
        deltas: [{ entityType: 'exercise', entityId: '2', opType: 'upsert', payload: {} }],
      },
      {
        cursor: '3000',
        hasMore: false,
        deltas: [{ entityType: 'exercise', entityId: '3', opType: 'upsert', payload: {} }],
      },
    ];

    const fetchMock = jest.fn();
    pages.forEach((page) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          acks: [],
          deltas: page.deltas,
          cursor: page.cursor,
          hasMore: page.hasMore,
        }),
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    (claimOutboxOps as jest.Mock).mockReturnValue([
      {
        op_id: 'op-1',
        device_id: 'device-1',
        user_id: 'user-1',
        entity_type: 'exercise',
        entity_id: 'exercise-1',
        op_type: 'upsert',
        payload_json: JSON.stringify({ name: 'Bench' }),
        attempt_count: 0,
      },
    ]);

    await syncNow();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(claimOutboxOps).toHaveBeenCalledTimes(1);

    const requestBodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(requestBodies[0].cursor).toBe('0');
    expect(requestBodies[1].cursor).toBe('1000');
    expect(requestBodies[2].cursor).toBe('2000');

    expect(requestBodies[0].ops.length).toBe(1);
    expect(requestBodies[1].ops).toEqual([]);
    expect(requestBodies[2].ops).toEqual([]);

    const cursorUpdates = (updateSyncState as jest.Mock).mock.calls
      .map((call) => call[0])
      .filter((update) => update.cursor)
      .map((update) => update.cursor);

    expect(cursorUpdates).toEqual(['1000', '2000', '3000']);
    expect((applyDeltas as jest.Mock).mock.calls).toHaveLength(3);
    expect(getSyncState().cursor).toBe('3000');
  });
});
