// @ts-nocheck
import { syncNow } from '../syncWorker';
import { applyDeltas } from '../applyDeltas';
import { claimOutboxOps } from '../../db/outboxRepo';
import { getSyncState, updateSyncState } from '../../db/syncStateRepo';

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
    applyDeltas: jest.fn(() => ({ applied: 1, skipped: 0, total: 1 })),
}));

describe('syncNow continuation', () => {
    beforeEach(() => {
        mockSyncState = { cursor: '0', backoff_until: null, consecutive_failures: 0 };
        process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.resetAllMocks();
    });

    it('continues syncing when hasMore is true', async () => {
        const page1Deltas = Array.from({ length: 1000 }, (_, index) => ({
            entityType: 'exercise',
            entityId: `exercise-${index}`,
            opType: 'upsert',
            payload: {},
        }));
        const page2Deltas = Array.from({ length: 500 }, (_, index) => ({
            entityType: 'exercise',
            entityId: `exercise-${index + 1000}`,
            opType: 'upsert',
            payload: {},
        }));

        const fetchMock = jest.fn();
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    acks: [],
                    deltas: page1Deltas,
                    cursor: '1000',
                    hasMore: true,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    acks: [],
                    deltas: page2Deltas,
                    cursor: '1500',
                    hasMore: false,
                }),
            });
        global.fetch = fetchMock as unknown as typeof fetch;

        const claimedOps = [
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
        ];
        (claimOutboxOps as jest.Mock).mockReturnValue(claimedOps);

        await syncNow();
        await jest.runAllTimersAsync();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
        expect(secondCallBody.ops).toEqual([]);
        expect((applyDeltas as jest.Mock).mock.calls).toHaveLength(2);
        expect(getSyncState().cursor).toBe('1500');
        expect(updateSyncState).toHaveBeenCalled();
    });
});