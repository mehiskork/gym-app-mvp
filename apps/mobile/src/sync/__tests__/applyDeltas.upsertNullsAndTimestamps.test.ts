import { applyDeltas, type SyncDelta } from '../applyDeltas';
import { exec, query } from '../../db/db';

jest.mock('../../db/db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    logEvent: jest.fn(),
}));

describe('applyDeltas null upsert + timestamp handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removes COALESCE and allows null overwrite', () => {
        (query as jest.Mock).mockReturnValue([]);

        const delta: SyncDelta = {
            entityType: 'exercise',
            entityId: 'e1',
            opType: 'upsert',
            payload: {
                id: 'e1',
                notes: null,
                updated_at: '2026-02-13 12:00:00',
            },
        };

        applyDeltas([delta]);

        expect(exec).toHaveBeenCalledTimes(1);
        const [sql] = (exec as jest.Mock).mock.calls[0];
        expect(sql).toContain('notes = excluded.notes');
        expect(sql).not.toContain('COALESCE(');
    });

    it('SQLite timestamp compare works; stale delta is skipped', () => {
        (query as jest.Mock).mockReturnValue([{ updated_at: '2026-02-13 12:00:00', version: undefined }]);

        const delta: SyncDelta = {
            entityType: 'exercise',
            entityId: 'e1',
            opType: 'upsert',
            payload: {
                id: 'e1',
                notes: 'old note',
                updated_at: '2026-02-13 11:00:00',
            },
        };

        const result = applyDeltas([delta]);

        expect(exec).not.toHaveBeenCalled();
        expect(result.skipped).toBe(1);
    });
});