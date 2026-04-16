jest.mock('../db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../tx', () => ({
    inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../outboxRepo', () => ({
    enqueueOutboxOp: jest.fn(),
}));

import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import { deleteDayExercise, renameDay } from '../dayExerciseRepo';

describe('dayExerciseRepo outbound sync enqueue coverage', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
        (enqueueOutboxOp as jest.Mock).mockReset();
    });

    it('enqueues program_day upsert snapshot when renaming a day', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
                return [{ id: 'day-1', name: 'Pull Day', deleted_at: null }];
            }
            return [];
        });

        renameDay('day-1', 'Pull Day');

        expect(exec).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE program_day'),
            ['Pull Day', 'day-1'],
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'program_day',
                entityId: 'day-1',
                opType: 'upsert',
            }),
        );
    });

    it('enqueues program_day_exercise delete snapshot when deleting a day exercise', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('JOIN exercise e') && params?.[0] === 'day-ex-1') {
                return [{ program_day_id: 'day-1', exercise_name: 'Bench Press' }];
            }
            if (sql.includes('FROM program_day_exercise') && sql.includes('deleted_at IS NOT NULL')) {
                return [];
            }
            if (sql.includes('COALESCE(MIN(position), 0) AS min_pos') && params?.[0] === 'day-1') {
                return [{ min_pos: 1 }];
            }
            if (sql.includes('WHERE program_day_id = ? AND deleted_at IS NULL') && sql.includes('ORDER BY position ASC')) {
                return [{ id: 'day-ex-2' }];
            }
            if (
                sql.includes('SELECT *') &&
                sql.includes('FROM program_day_exercise') &&
                params?.[0] === 'day-ex-1'
            ) {
                return [{ id: 'day-ex-1', program_day_id: 'day-1', deleted_at: '2026-04-16 00:00:00' }];
            }
            return [];
        });

        deleteDayExercise('day-ex-1');

        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'program_day_exercise',
                entityId: 'day-ex-1',
                opType: 'delete',
            }),
        );
    });
});