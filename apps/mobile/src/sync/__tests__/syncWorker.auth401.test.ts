import { syncNow } from '../syncWorker';
import { claimOutboxOps, markOutboxOpsFailed, repairStaleInFlightOps } from '../../db/outboxRepo';
import { finishSyncRun } from '../../db/syncRunRepo';
import { deviceCredentialStore } from '../../auth/deviceCredentialStore';
import { accountSessionStore } from '../../auth/accountSessionStore';

let mockToken: string | null = 'device-token';
let mockAccountAccessToken: string | null = null;
let mockAccountInvalidatedAt: string | null = null;

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
    getDeviceToken: jest.fn(async () => mockToken),
    getOrCreateDeviceSecret: jest.fn(async () => 'secret-1'),
    setDeviceToken: jest.fn(async (token: string | null) => {
      mockToken = token;
    }),
  },
}));

jest.mock('../../auth/accountSessionStore', () => ({
  accountSessionStore: {
    get: jest.fn(async () =>
      mockAccountAccessToken
        ? {
          accessToken: mockAccountAccessToken,
          invalidatedAt: mockAccountInvalidatedAt ?? undefined,
          invalidationReason: mockAccountInvalidatedAt ? 'sync_401' : undefined,
        }
        : null,
    ),
    getUsable: jest.fn(async () =>
      mockAccountAccessToken && !mockAccountInvalidatedAt
        ? { accessToken: mockAccountAccessToken }
        : null,
    ),
    invalidate: jest.fn(async () => {
      mockAccountInvalidatedAt = '2026-04-07T00:00:00.000Z';
    }),
  },
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

describe('syncNow 401 self-heal', () => {
  beforeEach(() => {
    mockToken = 'device-token';
    mockAccountAccessToken = null;
    mockAccountInvalidatedAt = null;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('clears device token on /sync 401 and keeps ops pending for retry', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ code: 'AUTH_TOKEN_EXPIRED' }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(deviceCredentialStore.setDeviceToken).toHaveBeenCalledWith(null);
    await expect(deviceCredentialStore.getDeviceToken()).resolves.toBeNull();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(repairStaleInFlightOps).toHaveBeenCalledTimes(1);
    expect(finishSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        httpStatus: 401,
        errorCode: 'auth_401_device_token_cleared',
      }),
    );
  });

  it('does not clear device token when /sync 401 came from account JWT auth', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ code: 'AUTH_UNAUTHORIZED' }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(accountSessionStore.getUsable).toHaveBeenCalledTimes(1);
    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('sync_401');
    expect(deviceCredentialStore.setDeviceToken).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(finishSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        httpStatus: 401,
        errorCode: 'auth_401_account_session',
      }),
    );
    expect((global.fetch as jest.Mock).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer account-jwt-token' }),
      }),
    );
  });

  it('prefers account JWT over device token for /sync when account session exists', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ acks: [], deltas: [], cursor: '1', hasMore: false }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toBe('https://example.test/sync');
    expect((global.fetch as jest.Mock).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer account-jwt-token' }),
      }),
    );
  });

  it('falls back to device token when account session is present but invalidated', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    mockAccountInvalidatedAt = '2026-04-07T00:00:00.000Z';
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ acks: [], deltas: [], cursor: '1', hasMore: false }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect((global.fetch as jest.Mock).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer device-token' }),
      }),
    );
  });


  it('re-registers on the next run and resumes sync', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'AUTH_UNAUTHORIZED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deviceToken: 'new-device-token', guestUserId: 'guest-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ acks: [], deltas: [], cursor: '1', hasMore: false }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncNow();
    await syncNow();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/device/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://example.test/sync',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-device-token' }),
      }),
    );
  });
  it('persists invalidation behavior across runs so stale account jwt is not reused', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'AUTH_UNAUTHORIZED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ acks: [], deltas: [], cursor: '1', hasMore: false }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncNow();
    await syncNow();

    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('sync_401');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/sync',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer device-token' }),
      }),
    );
  });
});
