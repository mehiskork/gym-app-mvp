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
import { deleteAllCompletedSessions, deleteSession } from '../historyRepo';

describe('historyRepo delete sync wiring', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
        (enqueueOutboxOp as jest.Mock).mockReset();
    });

    it('deleteSession enqueues delete ops for affected workout entities', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM workout_set ws') && sql.includes('wse.workout_session_id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'set-1' }, { id: 'set-2' }];
            }
            if (sql.includes('FROM workout_session_exercise') && sql.includes('workout_session_id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'wse-1' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_set')) {
                return [
                    { id: params?.[0], deleted_at: '2026-04-16 00:00:00', updated_at: '2026-04-16 00:00:00' },
                ];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
                return [
                    {
                        id: params?.[0],
                        workout_session_id: 'session-1',
                        deleted_at: '2026-04-16 00:00:00',
                        updated_at: '2026-04-16 00:00:00',
                    },
                ];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
                return [
                    {
                        id: params?.[0],
                        status: 'completed',
                        deleted_at: '2026-04-16 00:00:00',
                        updated_at: '2026-04-16 00:00:00',
                    },
                ];
            }
            if (sql.includes('FROM workout_session') && sql.includes('WHERE id = ?')) {
                expect(params).toEqual(['session-1']);
                return [{ id: 'session-1' }];
            }
            return [];
        });

        deleteSession('session-1');

        expect(exec).toHaveBeenCalledTimes(3);
        expect(enqueueOutboxOp).toHaveBeenCalledTimes(4);
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_set',
                entityId: 'set-1',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_set',
                entityId: 'set-2',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session_exercise',
                entityId: 'wse-1',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session',
                entityId: 'session-1',
                opType: 'delete',
            }),
        );
    });

    it('deleteAllCompletedSessions enqueues delete ops for affected workout entities', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM workout_set ws') && sql.includes("wsession.status = 'completed'")) {
                return [{ id: 'set-a' }];
            }
            if (
                sql.includes('FROM workout_session_exercise wse') &&
                sql.includes("ws.status = 'completed'")
            ) {
                return [{ id: 'wse-a' }, { id: 'wse-b' }];
            }
            if (sql.includes('FROM workout_session') && sql.includes("WHERE status = 'completed'")) {
                return [{ id: 'session-a' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_set')) {
                return [{ id: params?.[0], deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
                return [{ id: params?.[0], deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
                return [{ id: params?.[0], deleted_at: '2026-04-16 00:00:00' }];
            }
            return [];
        });

        deleteAllCompletedSessions();

        expect(exec).toHaveBeenCalledTimes(3);
        expect(enqueueOutboxOp).toHaveBeenCalledTimes(4);
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'workout_set', entityId: 'set-a', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session_exercise',
                entityId: 'wse-a',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session_exercise',
                entityId: 'wse-b',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'workout_session',
                entityId: 'session-a',
                opType: 'delete',
            }),
        );
    });
});