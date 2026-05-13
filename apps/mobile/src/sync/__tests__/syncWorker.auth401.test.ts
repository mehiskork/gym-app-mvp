import { syncNow } from '../syncWorker';
import {
  claimOutboxOps,
  markOutboxOpRejected,
  markOutboxOpsFailed,
  repairStaleInFlightOps,
} from '../../db/outboxRepo';
import { finishSyncRun } from '../../db/syncRunRepo';
import { deviceCredentialStore } from '../../auth/deviceCredentialStore';
import { accountSessionStore } from '../../auth/accountSessionStore';
import {
  getUsableAccountSessionWithFreshToken,
  signOutFromGoogle,
} from '../../auth/firebaseGoogleAuthClient';
import { updateSyncState } from '../../db/syncStateRepo';
import { updateAuthDebugState } from '../../db/appMetaRepo';
import { resetToGuestBootstrap } from '../../auth/identityTransition';

let mockToken: string | null = 'device-token';
let mockAccountAccessToken: string | null = null;
let mockAccountInvalidatedAt: string | null = null;
let mockAccountRefreshFailed = false;
let mockLinkedAccountState = false;

jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://example.test'),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getEffectiveUserId: jest.fn(() => 'user-1'),
  getGuestUserId: jest.fn(() => null),
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
  isLinkedAccountState: jest.fn(() => mockLinkedAccountState),
  isSyncPaused: jest.fn(() => false),
  pauseSync: jest.fn(),
  setLastSyncAckSummary: jest.fn(),
  setGuestUserId: jest.fn(),
  updateAuthDebugState: jest.fn(),
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
    invalidate: jest.fn(async () => {
      mockAccountInvalidatedAt = '2026-04-07T00:00:00.000Z';
    }),
  },
}));

jest.mock('../../auth/firebaseGoogleAuthClient', () => ({
  getUsableAccountSessionWithFreshToken: jest.fn(async () => {
    if (mockAccountRefreshFailed) {
      mockAccountInvalidatedAt = '2026-04-07T00:00:00.000Z';
      return null;
    }
    return mockAccountAccessToken && !mockAccountInvalidatedAt
      ? { accessToken: mockAccountAccessToken }
      : null;
  }),
  signOutFromGoogle: jest.fn(async () => undefined),
}));

jest.mock('../../auth/identityTransition', () => ({
  resetToGuestBootstrap: jest.fn(async () => undefined),
}));

jest.mock('../syncScheduler', () => ({
  cancelScheduledSync: jest.fn(),
}));

jest.mock('../../db/outboxRepo', () => ({
  claimOutboxOps: jest.fn(),
  markOutboxOpRejected: jest.fn(),
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
  getSyncApplyFailureDiagnosticFromError: jest.fn(() => null),
  persistSyncApplyFailureDiagnostic: jest.fn(),
}));

describe('syncNow 401 self-heal', () => {
  beforeEach(() => {
    mockToken = 'device-token';
    mockAccountAccessToken = null;
    mockAccountInvalidatedAt = null;
    mockAccountRefreshFailed = false;
    mockLinkedAccountState = false;
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
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
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

    expect(getUsableAccountSessionWithFreshToken).toHaveBeenCalledTimes(1);
    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('sync_401');
    expect(deviceCredentialStore.setDeviceToken).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
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

  it('uses device token in guest mode when account session is present but invalidated', async () => {
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

  it('blocks sync instead of using device token when linked account session is invalidated', async () => {
    mockLinkedAccountState = true;
    mockAccountAccessToken = 'account-jwt-token';
    mockAccountInvalidatedAt = '2026-04-07T00:00:00.000Z';
    global.fetch = jest.fn() as unknown as typeof fetch;

    await syncNow();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(claimOutboxOps).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(deviceCredentialStore.setDeviceToken).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: 'account_reauth_required',
        backoff_until: null,
        consecutive_failures: 0,
      }),
    );
    expect(updateAuthDebugState).toHaveBeenCalledWith({
      syncAuthModeNextPlanned: 'blocked_reauth',
    });
  });

  it('handles account JWT 410 ACCOUNT_DELETED with remote-deleted cleanup and no retry marking', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({
        code: 'ACCOUNT_DELETED',
        message: 'TrainFrame account was deleted',
        requestId: 'req-1',
        details: null,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('account_deleted_remote');
    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledWith({ resumeSyncAfterReset: true });
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(finishSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        httpStatus: 410,
        errorCode: 'account_deleted_remote',
        errorMessage: 'TrainFrame account was deleted',
      }),
    );
  });

  it('does not treat device-token 410 ACCOUNT_DELETED as remote account deletion', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({ code: 'ACCOUNT_DELETED' }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(accountSessionStore.invalidate).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op_id: 'op-1' })]),
      'sync failed: 410',
      expect.any(Function),
    );
  });

  it('does not treat generic account JWT 410 as remote account deletion', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({ code: 'SOMETHING_ELSE' }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(accountSessionStore.invalidate).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ op_id: 'op-1' })]),
      'sync failed: 410',
      expect.any(Function),
    );
  });

  it('blocks sync instead of using device token when linked account session is missing', async () => {
    mockLinkedAccountState = true;
    mockAccountAccessToken = null;
    global.fetch = jest.fn() as unknown as typeof fetch;

    await syncNow();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(claimOutboxOps).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(deviceCredentialStore.setDeviceToken).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: 'account_reauth_required',
      }),
    );
    expect(updateAuthDebugState).toHaveBeenCalledWith({
      syncAuthModeNextPlanned: 'blocked_reauth',
    });
  });

  it('uses device token in guest mode when account refresh fails before /sync', async () => {
    mockAccountAccessToken = 'account-jwt-token';
    mockAccountRefreshFailed = true;
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

  it('blocks sync instead of using device token when linked account refresh fails before /sync', async () => {
    mockLinkedAccountState = true;
    mockAccountAccessToken = 'account-jwt-token';
    mockAccountRefreshFailed = true;
    global.fetch = jest.fn() as unknown as typeof fetch;

    await syncNow();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(claimOutboxOps).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(deviceCredentialStore.setDeviceToken).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: 'account_reauth_required',
      }),
    );
    expect(updateAuthDebugState).toHaveBeenCalledWith({
      syncAuthModeNextPlanned: 'blocked_reauth',
    });
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
    mockLinkedAccountState = true;
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(claimOutboxOps).toHaveBeenCalledTimes(1);
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error: 'account_reauth_required',
      }),
    );
  });
});
