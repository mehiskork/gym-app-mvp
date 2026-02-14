import { applyDeltas, type SyncDelta } from '../applyDeltas';
import { exec, query } from '../../db/db';
import { logEvent } from '../../utils/logger';

jest.mock('../../db/db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    logEvent: jest.fn(),
}));

describe('applyDeltas in-progress workout_session guard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips incoming IN_PROGRESS upsert when a different local session is in progress', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ id: 'A' }])
            .mockReturnValueOnce([]);

        const delta: SyncDelta = {
            entityType: 'workout_session',
            entityId: 'B',
            opType: 'upsert',
            payload: {
                id: 'B',
                status: 'IN_PROGRESS',
                updated_at: '2026-03-01 08:00:00',
            },
        };

        const result = applyDeltas([delta]);

        expect(exec).not.toHaveBeenCalled();
        expect(logEvent).toHaveBeenCalledWith(
            'warn',
            'sync',
            'sync_delta_skipped_in_progress_conflict',
            {
                localInProgressId: 'A',
                incomingId: 'B',
                incomingUpdatedAt: '2026-03-01 08:00:00',
            },
        );
        expect(result.skipped).toBe(1);
    });

    it('applies IN_PROGRESS upsert when incoming session matches local in-progress id', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ id: 'A' }])
            .mockReturnValueOnce([]);

        const delta: SyncDelta = {
            entityType: 'workout_session',
            entityId: 'A',
            opType: 'upsert',
            payload: {
                id: 'A',
                status: 'IN_PROGRESS',
            },
        };

        applyDeltas([delta]);

        expect(exec).toHaveBeenCalledTimes(1);
    });

    it('does not trigger guard for non-IN_PROGRESS status', () => {
        (query as jest.Mock).mockReturnValueOnce([]);

        const delta: SyncDelta = {
            entityType: 'workout_session',
            entityId: 'B',
            opType: 'upsert',
            payload: {
                id: 'B',
                status: 'COMPLETED',
            },
        };

        applyDeltas([delta]);

        expect(exec).toHaveBeenCalledTimes(1);
        expect(logEvent).not.toHaveBeenCalledWith(
            'warn',
            'sync',
            'sync_delta_skipped_in_progress_conflict',
            expect.anything(),
        );
    });
});