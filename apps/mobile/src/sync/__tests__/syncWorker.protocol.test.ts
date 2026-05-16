import { syncNow } from '../syncWorker';
import {
  claimOutboxOps,
  markOutboxOpFailed,
  markOutboxOpRejected,
  markOutboxOpsAcked,
  markOutboxOpsFailed,
} from '../../db/outboxRepo';
import { updateSyncState } from '../../db/syncStateRepo';
import { deviceCredentialStore } from '../../auth/deviceCredentialStore';
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
  markOutboxOpRejected: jest.fn(),
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
    (markOutboxOpRejected as jest.Mock).mockImplementation(() => undefined);
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
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '1' }));
  });

  it('does not ack rejected ops and sends them through rejected-op handling', async () => {
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
    expect(markOutboxOpFailed).not.toHaveBeenCalled();
    expect(markOutboxOpRejected).toHaveBeenCalledWith(
      'op-1',
      'sync op rejected: bad payload',
      expect.any(Function),
    );
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '2' }));
  });

  it('keeps backend rejected ack below max on the rejected-op path', async () => {
    (claimOutboxOps as jest.Mock).mockReturnValue([{ ...baseOp, attempt_count: 8 }]);
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'rejected', reason: 'immutable field' }],
        deltas: [],
        cursor: '2',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpRejected).toHaveBeenCalledWith(
      'op-1',
      'sync op rejected: immutable field',
      expect.any(Function),
    );
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
  });

  it('routes backend rejected ack at max through the only dead-letter-eligible path', async () => {
    (claimOutboxOps as jest.Mock).mockReturnValue([{ ...baseOp, attempt_count: 9 }]);
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

    expect(markOutboxOpRejected).toHaveBeenCalledWith(
      'op-1',
      'sync op rejected: bad payload',
      expect.any(Function),
    );
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
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
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
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
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
  });

  it.each([400, 429, 500])(
    'keeps whole-request HTTP %i failures retryable instead of dead-lettering',
    async (statusCode) => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: statusCode,
        json: async () => ({ code: 'SYNC_FAILED' }),
      }) as unknown as typeof fetch;

      await syncNow();

      expect(markOutboxOpsFailed).toHaveBeenCalledWith(
        [baseOp],
        `sync failed: ${statusCode}`,
        expect.any(Function),
      );
      expect(markOutboxOpRejected).not.toHaveBeenCalled();
      expect(updateSyncState).not.toHaveBeenCalledWith(expect.objectContaining({ cursor: '4' }));
    },
  );

  it.each(['Network request failed', 'request timeout'])(
    'keeps %s retryable instead of dead-lettering',
    async (message) => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error(message)) as unknown as typeof fetch;

      await syncNow();

      expect(markOutboxOpsFailed).toHaveBeenCalledWith([baseOp], message, expect.any(Function));
      expect(markOutboxOpRejected).not.toHaveBeenCalled();
    },
  );

  it('registers a missing guest device token and drains the pending outbox in the same sync', async () => {
    mockDeviceToken = null;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deviceToken: 'recovered-device-token', guestUserId: 'guest-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          acks: [{ opId: 'op-1', status: 'applied' }],
          deltas: [],
          cursor: '13',
          hasMore: false,
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    await syncNow();

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/device/register');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.test/sync');
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer recovered-device-token' }),
      }),
    );
    expect(deviceCredentialStore.setDeviceToken).toHaveBeenCalledWith('recovered-device-token');
    expect(markOutboxOpsAcked).toHaveBeenCalledWith(['op-1']);
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '13' }));
  });

  it('keeps guest outbox pending when missing-token registration fails offline', async () => {
    mockDeviceToken = null;
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed')) as unknown as typeof fetch;

    await syncNow();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(claimOutboxOps).not.toHaveBeenCalled();
    expect(markOutboxOpsAcked).not.toHaveBeenCalled();
    expect(markOutboxOpsFailed).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        last_error: 'registerDeviceIfNeeded: Network request failed',
        backoff_until: expect.any(String),
        consecutive_failures: 1,
      }),
    );
  });

  it('syncs a later valid op when dead ops have already been excluded from the claimed batch', async () => {
    const laterOp = { ...baseOp, id: 'row-2', op_id: 'op-2', entity_id: 'exercise-2' };
    (claimOutboxOps as jest.Mock).mockReturnValue([laterOp]);
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-2', status: 'applied' }],
        deltas: [],
        cursor: '8',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.ops).toEqual([expect.objectContaining({ opId: 'op-2', entityId: 'exercise-2' })]);
    expect(markOutboxOpsAcked).toHaveBeenCalledWith(['op-2']);
    expect(markOutboxOpRejected).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenCalledWith(expect.objectContaining({ cursor: '8' }));
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

  it('passes workout_set ops sent in the current sync request as protected delta keys', async () => {
    const workoutSetOp = {
      ...baseOp,
      entity_type: 'workout_set',
      entity_id: 'set-1',
      payload_json: JSON.stringify({
        id: 'set-1',
        workout_session_exercise_id: 'wse-1',
        set_index: 1,
        is_completed: 1,
        updated_at: '2026-05-01 12:00:00',
      }),
    };
    (claimOutboxOps as jest.Mock).mockReturnValue([workoutSetOp]);
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
            payload: {
              id: 'set-1',
              workout_session_exercise_id: 'wse-1',
              set_index: 1,
              is_completed: 0,
              updated_at: '2026-05-01 12:00:00',
            },
          },
        ],
        cursor: '9',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(applyDeltas).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        protectedEntityKeys: new Set(['workout_set:set-1']),
      }),
    );
  });

  it('passes workout_session_exercise ops sent in the current sync request as protected delta keys', async () => {
    const workoutSessionExerciseOp = {
      ...baseOp,
      entity_type: 'workout_session_exercise',
      entity_id: 'wse-1',
      payload_json: JSON.stringify({
        id: 'wse-1',
        workout_session_id: 'session-1',
        exercise_id: 'exercise-1',
        position: 1,
        updated_at: '2026-05-01 12:00:00',
      }),
    };
    (claimOutboxOps as jest.Mock).mockReturnValue([workoutSessionExerciseOp]);
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [
          {
            entityType: 'workout_session_exercise',
            entityId: 'wse-1',
            opType: 'upsert',
            payload: {
              id: 'wse-1',
              workout_session_id: 'session-1',
              exercise_id: 'exercise-1',
              position: 1,
              updated_at: '2026-05-01 12:00:00',
            },
          },
        ],
        cursor: '11',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    const applyContext = (applyDeltas as jest.Mock).mock.calls[0][1];
    expect(Array.from(applyContext.protectedEntityKeys)).toEqual([
      'workout_session_exercise:wse-1',
    ]);
  });

  it('passes workout_session ops sent in the current sync request as protected delta keys', async () => {
    const workoutSessionOp = {
      ...baseOp,
      entity_type: 'workout_session',
      entity_id: 'session-1',
      payload_json: JSON.stringify({
        id: 'session-1',
        title: 'Quick Workout',
        status: 'in_progress',
        updated_at: '2026-05-01 12:00:00',
      }),
    };
    (claimOutboxOps as jest.Mock).mockReturnValue([workoutSessionOp]);
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [
          {
            entityType: 'workout_session',
            entityId: 'session-1',
            opType: 'upsert',
            payload: {
              id: 'session-1',
              title: 'Quick Workout',
              status: 'in_progress',
              updated_at: '2026-05-01 12:00:00',
            },
          },
        ],
        cursor: '12',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    const applyContext = (applyDeltas as jest.Mock).mock.calls[0][1];
    expect(Array.from(applyContext.protectedEntityKeys)).toEqual(['workout_session:session-1']);
  });

  it('keeps just-sent workout_set rows protected even though acks are written before deltas apply', async () => {
    const workoutSetOp = {
      ...baseOp,
      entity_type: 'workout_set',
      entity_id: 'set-just-sent',
      payload_json: JSON.stringify({
        id: 'set-just-sent',
        workout_session_exercise_id: 'wse-1',
        set_index: 1,
        is_completed: 1,
        updated_at: '2026-05-01 12:00:00',
      }),
    };
    (claimOutboxOps as jest.Mock).mockReturnValue([workoutSetOp]);
    (markOutboxOpsAcked as jest.Mock).mockImplementation(() => {
      expect(applyDeltas).not.toHaveBeenCalled();
    });
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        acks: [{ opId: 'op-1', status: 'applied' }],
        deltas: [
          {
            entityType: 'workout_set',
            entityId: 'set-just-sent',
            opType: 'upsert',
            payload: {
              id: 'set-just-sent',
              workout_session_exercise_id: 'wse-1',
              set_index: 1,
              is_completed: 0,
              updated_at: '2026-05-01 12:00:00',
            },
          },
        ],
        cursor: '10',
        hasMore: false,
      }),
    }) as unknown as typeof fetch;

    await syncNow();

    expect(markOutboxOpsAcked).toHaveBeenCalledWith(['op-1']);
    expect(applyDeltas).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        protectedEntityKeys: new Set(['workout_set:set-just-sent']),
      }),
    );
  });
});
