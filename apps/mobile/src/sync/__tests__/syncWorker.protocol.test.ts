import { syncNow } from '../syncWorker';
import {
  claimOutboxOps,
  markOutboxOpFailed,
  markOutboxOpsAcked,
  markOutboxOpsFailed,
} from '../../db/outboxRepo';
import { updateSyncState } from '../../db/syncStateRepo';
import { applyDeltas } from '../applyDeltas';
import { rebuildPrEventsFromWorkoutHistory } from '../../db/prRepo';

let mockCursor = '0';
let mockDeviceToken: string | null = 'device-token';

const baseOp = {
  id: 'row-1',
  op_id: 'op-1',
  device_id: 'device-1',
  user_id: 'user-1',
  entity_type: 'exercise',
  entity_id: 'exercise-1',
  op_type: 'upsert' as const,
  payload_json: JSON.stringify({ id: 'exercise-1', name: 'Bench' }),
  status: 'pending',
  attempt_count: 0,
  last_error: null,
  next_attempt_at: null,
  last_attempt_at: null,
  updated_at: '2026-04-29T00:00:00.000Z',
};

jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://example.test'),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getGuestUserId: jest.fn(() => null),
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
  isLinkedAccountState: jest.fn(() => false),
  isSyncPaused: jest.fn(() => false),
  setLastSyncAckSummary: jest.fn(),
  setGuestUserId: jest.fn(),
  updateAuthDebugState: jest.fn(),
}));

jest.mock('../../auth/deviceCredentialStore', () => ({
  deviceCredentialStore: {
    getDeviceToken: jest.fn(async () => mockDeviceToken),
    getOrCreateDeviceSecret: jest.fn(async () => 'secret-1'),
    setDeviceToken: jest.fn(async (token: string | null) => {
      mockDeviceToken = token;
    }),
  },
}));

jest.mock('../../auth/accountSessionStore', () => ({
  accountSessionStore: {
    invalidate: jest.fn(),
  },
}));

jest.mock('../../auth/firebaseGoogleAuthClient', () => ({
  getUsableAccountSessionWithFreshToken: jest.fn(async () => null),
}));

jest.mock('../../db/outboxRepo', () => ({
  claimOutboxOps: jest.fn(),
  markOutboxOpFailed: jest.fn(),
  markOutboxOpsAcked: jest.fn(),
  markOutboxOpsFailed: jest.fn(),
  repairStaleInFlightOps: jest.fn(),
}));

jest.mock('../../db/prRepo', () => ({
  rebuildPrEventsFromWorkoutHistory: jest.fn(),
}));

jest.mock('../../db/syncStateRepo', () => ({
  getSyncState: jest.fn(() => ({
    cursor: mockCursor,
    backoff_until: null,
    consecutive_failures: 0,
  })),
  normalizeCursor: jest.fn((cursor?: string | null) => cursor ?? '0'),
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

describe('syncWorker protocol invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCursor = '0';
    mockDeviceToken = 'device-token';
    (claimOutboxOps as jest.Mock).mockReturnValue([baseOp]);
    (applyDeltas as jest.Mock).mockReturnValue({ applied: 0, skipped: 0, total: 0 });
    (markOutboxOpsAcked as jest.Mock).mockImplementation(() => undefined);
    (markOutboxOpFailed as jest.Mock).mockImplementation(() => undefined);
    (markOutboxOpsFailed as jest.Mock).mockImplementation(() => undefined);
    (rebuildPrEventsFromWorkoutHistory as jest.Mock).mockImplementation(() => 0);
  });

  it('stores opaque backend cursor exactly and sends it unchanged on the next sync', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          acks: [{ opId: 'op-1', status: 'applied' }],
          deltas: [],
          cursor: 'snapshot:abc',
          hasMore: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          acks: [{ opId: 'op-1', status: 'applied' }],
          deltas: [],
          cursor: '590',
          hasMore: false,
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncNow();
    expect(updateSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'snapshot:abc' }),
    );

    mockCursor = 'snapshot:abc';
    await syncNow();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).cursor).toBe('snapshot:abc');
  });

  it('acks applied and noop statuses as successful idempotent outcomes', async () => {
    const secondOp = { ...baseOp, id: 'row-2', op_id: 'op-2', entity_id: 'exercise-2' };
    (claimOutboxOps as jest.Mock).mockReturnValue([baseOp, secondOp]);
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [
          { opId: 'op-1', status: 'applied' },
          { opId: 'op-2', status: 'noop' },
        ],
        deltas: [],
        cursor: '1',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpsAcked).toHaveBeenCalledWith(['op-1', 'op-2']);
    expect(markOutboxOpFailed).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '1' }));
  });

  it('does not ack rejected ops and stores the server reason as a failed op', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'rejected', reason: 'bad payload' }],
        deltas: [],
        cursor: '2',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpsAcked).toHaveBeenCalledWith([]);
    expect(markOutboxOpFailed).toHaveBeenCalledWith(
      'op-1',
      'sync op rejected: bad payload',
      expect.any(String),
    );
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '2' }));
  });

  it('does not ack missing acks and classifies the sent op as failed before cursor advance', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ acks: [], deltas: [], cursor: '3', hasMore: false }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpsAcked).toHaveBeenCalledWith([]);
    expect(markOutboxOpsFailed).toHaveBeenCalledWith(
      [baseOp],
      'sync response missing opId ack',
      expect.any(Function),
    );
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '3' }));
  });

  it('fails safely and does not advance cursor for unknown ack status', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'mystery' }],
        deltas: [],
        cursor: '4',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpsAcked).not.toHaveBeenCalled();
    expect(updateSyncState).not.toHaveBeenCalledWith(expect.objectContaining({ cursor: '4' }));
    expect(markOutboxOpsFailed).toHaveBeenCalledWith(
      [baseOp],
      'sync response returned unknown ack status: mystery',
      expect.any(Function),
    );
  });

  it('does not advance cursor if delta apply fails', async () => {
    (applyDeltas as jest.Mock).mockImplementation(() => {
      throw new Error('delta apply failed');
    });
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [{ entityType: 'program', entityId: 'program-1', opType: 'upsert', payload: {} }],
        cursor: '5',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(updateSyncState).not.toHaveBeenCalledWith(expect.objectContaining({ cursor: '5' }));
  });

  it('does not advance cursor if ack bookkeeping fails', async () => {
    (markOutboxOpsAcked as jest.Mock).mockImplementation(() => {
      throw new Error('ack write failed');
    });
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [],
        cursor: '6',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(updateSyncState).not.toHaveBeenCalledWith(expect.objectContaining({ cursor: '6' }));
  });

  it('rebuilds local PR cache after workout history deltas apply', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [
          {
            entityType: 'workout_set',
            entityId: 'set-1',
            opType: 'upsert',
            payload: { id: 'set-1', workout_session_exercise_id: 'wse-1' },
          },
        ],
        cursor: '7',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(rebuildPrEventsFromWorkoutHistory).toHaveBeenCalledTimes(1);
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '7' }));
  });
});
