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
import { discardSession } from '../workoutSessionRepo';

describe('discardSession sync wiring', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
        (enqueueOutboxOp as jest.Mock).mockReset();
    });

    it('soft-deletes session tree and enqueues delete tombstones for all affected workout entities', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM workout_set ws') && sql.includes('wse.workout_session_id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'set-1' }, { id: 'set-2' }];
            }
            if (sql.includes('FROM workout_session_exercise') && sql.includes('workout_session_id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'wse-1' }];
            }
            if (sql.includes('FROM workout_session\n      WHERE id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'session-1' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_set')) {
                return [{ id: params?.[0], deleted_at: '2026-04-27 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
                return [{ id: params?.[0], workout_session_id: 'session-1', deleted_at: '2026-04-27 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
                return [{ id: params?.[0], status: 'discarded', deleted_at: '2026-04-27 00:00:00' }];
            }
            return [];
        });

        discardSession('session-1');

        expect(exec).toHaveBeenCalledTimes(3);
        expect(exec).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('UPDATE workout_set'),
            ['session-1'],
        );
        expect(exec).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('UPDATE workout_session_exercise'),
            ['session-1'],
        );
        expect(exec).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('UPDATE workout_session'),
            ['session-1'],
        );

        expect(enqueueOutboxOp).toHaveBeenCalledTimes(4);
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'workout_set', entityId: 'set-1', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'workout_set', entityId: 'set-2', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session_exercise',
                entityId: 'wse-1',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'workout_session', entityId: 'session-1', opType: 'delete' }),
        );
    });
});