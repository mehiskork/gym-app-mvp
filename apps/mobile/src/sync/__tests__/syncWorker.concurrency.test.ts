// @ts-nocheck
import { syncNow } from '../syncWorker';
import { claimOutboxOps } from '../../db/outboxRepo';

jest.mock('../../db/appMetaRepo', () => ({
  getDeviceToken: jest.fn(() => 'device-token'),
  getEffectiveUserId: jest.fn(() => 'user-1'),
  getGuestUserId: jest.fn(() => null),
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
  getOrCreateDeviceSecret: jest.fn(() => 'secret-1'),
  isSyncPaused: jest.fn(() => false),
  setLastSyncAckSummary: jest.fn(),
  setDeviceToken: jest.fn(),
  setGuestUserId: jest.fn(),
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

describe('syncNow single-flight', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('coalesces concurrent callers into one network chain', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    const fetchMock = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
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

    const first = syncNow();
    const second = syncNow();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [],
        deltas: [],
        cursor: '10',
        hasMore: false,
      }),
    });

    await expect(Promise.all([first, second])).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
