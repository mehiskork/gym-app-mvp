// @ts-nocheck
import { syncNow } from '../syncWorker';
import { applyDeltas } from '../applyDeltas';
import { claimOutboxOps, markOutboxOpsAcked } from '../../db/outboxRepo';
import { isSyncPaused } from '../../db/appMetaRepo';
import { getSyncState, updateSyncState } from '../../db/syncStateRepo';
import { logEvent } from '../../utils/logger';
import { rebuildPrEventsFromWorkoutHistory } from '../../db/prRepo';
import { resolveLocalAccountStateFromSession } from '../../auth/localAccountState';
import { deviceCredentialStore } from '../../auth/deviceCredentialStore';

jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://example.test'),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
  isSyncPaused: jest.fn(() => true),
  setLastSyncAckSummary: jest.fn(),
  setGuestUserId: jest.fn(),
  updateAuthDebugState: jest.fn(),
}));

jest.mock('../../auth/deviceCredentialStore', () => ({
  deviceCredentialStore: {
    getDeviceToken: jest.fn(async () => 'device-token'),
    getOrCreateDeviceSecret: jest.fn(async () => 'secret-1'),
    setDeviceToken: jest.fn(async () => undefined),
  },
}));

jest.mock('../../auth/accountSessionStore', () => ({
  accountSessionStore: {
    invalidate: jest.fn(async () => undefined),
  },
}));

jest.mock('../../auth/firebaseGoogleAuthClient', () => ({
  getUsableAccountSessionWithFreshToken: jest.fn(async () => null),
}));

jest.mock('../../auth/localAccountState', () => ({
  resolveLocalAccountStateFromSession: jest.fn(() => ({ status: 'guest', accountSession: null })),
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

jest.mock('../../db/prRepo', () => ({
  rebuildPrEventsFromWorkoutHistory: jest.fn(),
}));

jest.mock('../applyDeltas', () => ({
  applyDeltas: jest.fn(() => ({ applied: 0, skipped: 0, total: 0 })),
  getSyncApplyFailureDiagnosticFromError: jest.fn(() => null),
  persistSyncApplyFailureDiagnostic: jest.fn(),
}));

describe('syncNow pause guard', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
    (isSyncPaused as jest.Mock).mockReturnValue(true);
    (claimOutboxOps as jest.Mock).mockReturnValue([]);
    (getSyncState as jest.Mock).mockReturnValue({
      cursor: '0',
      backoff_until: null,
      consecutive_failures: 0,
    });
    (resolveLocalAccountStateFromSession as jest.Mock).mockReturnValue({
      status: 'guest',
      accountSession: null,
    });
    (deviceCredentialStore.getDeviceToken as jest.Mock).mockResolvedValue('device-token');
    (applyDeltas as jest.Mock).mockReturnValue({ applied: 0, skipped: 0, total: 0 });
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
    expect(logEvent).toHaveBeenCalledWith('info', 'sync', 'Sync paused');
  });

  it('does not process acks, deltas, cursor, or PR rebuild when paused after fetch resolves', async () => {
    (isSyncPaused as jest.Mock).mockReturnValueOnce(false).mockReturnValueOnce(true);
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [{ entityType: 'workout_session', entityId: 'session-1', deleted: false }],
        cursor: 'cursor-2',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(markOutboxOpsAcked).not.toHaveBeenCalled();
    expect(applyDeltas).not.toHaveBeenCalled();
    expect(updateSyncState).not.toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
    );
    expect(rebuildPrEventsFromWorkoutHistory).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith('info', 'sync', 'Sync paused before response processing');
  });
});
