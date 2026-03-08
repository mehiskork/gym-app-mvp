import { syncNow } from '../syncWorker';
import { claimOutboxOps, markOutboxOpsFailed, repairStaleInFlightOps } from '../../db/outboxRepo';
import { getDeviceToken, setDeviceToken } from '../../db/appMetaRepo';
import { finishSyncRun } from '../../db/syncRunRepo';

let mockToken: string | null = 'device-token';

jest.mock('../../db/appMetaRepo', () => ({
    getDeviceToken: jest.fn(() => mockToken),
    getEffectiveUserId: jest.fn(() => 'user-1'),
    getGuestUserId: jest.fn(() => null),
    getOrCreateDeviceId: jest.fn(() => 'device-1'),
    getOrCreateDeviceSecret: jest.fn(() => 'secret-1'),
    isSyncPaused: jest.fn(() => false),
    setLastSyncAckSummary: jest.fn(),
    setDeviceToken: jest.fn((token: string | null) => {
        mockToken = token;
    }),
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

describe('syncNow 401 self-heal', () => {
    beforeEach(() => {
        mockToken = 'device-token';
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
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ code: 'AUTH_TOKEN_EXPIRED' }),
            }) as unknown as typeof fetch;

        await syncNow();

        expect(setDeviceToken).toHaveBeenCalledWith(null);
        expect(getDeviceToken()).toBeNull();
        expect(markOutboxOpsFailed).not.toHaveBeenCalled();
        expect(repairStaleInFlightOps).toHaveBeenCalledTimes(1);
        expect(finishSyncRun).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({
                status: 'failed',
                httpStatus: 401,
                errorCode: 'auth_401_cleared',
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
});