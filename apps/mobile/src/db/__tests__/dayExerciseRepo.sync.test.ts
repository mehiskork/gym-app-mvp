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
import {
    addExerciseToDay,
    deleteDay,
    deleteDayExercise,
    renameDay,
    reorderDayExercises,
} from '../dayExerciseRepo';


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

    it('deleteDayExercise tombstones child planned_set rows and enqueues delete snapshots', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('JOIN exercise e') && params?.[0] === 'day-ex-1') {
                return [{ program_day_id: 'day-1', exercise_name: 'Bench Press' }];
            }
            if (sql.includes('FROM planned_set') && sql.includes('deleted_at IS NULL') && params?.[0] === 'day-ex-1') {
                return [{ id: 'ps-1' }, { id: 'ps-2' }];
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
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'ps-1') {
                return [{ id: 'ps-1', program_day_exercise_id: 'day-ex-1', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'ps-2') {
                return [{ id: 'ps-2', program_day_exercise_id: 'day-ex-1', deleted_at: '2026-04-16 00:00:00' }];
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

        expect(exec).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE planned_set'),
            ['day-ex-1'],
        );
        expect(enqueueOutboxOp).toHaveBeenCalledTimes(3);
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                entityType: 'planned_set',
                entityId: 'ps-1',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                entityType: 'planned_set',
                entityId: 'ps-2',
                opType: 'delete',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                entityType: 'program_day_exercise',
                entityId: 'day-ex-1',
                opType: 'delete',
            }),
        );
    });
    it('enqueues program_day_exercise upsert snapshot when adding an exercise to a day', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM program_day_exercise') && sql.includes('deleted_at IS NOT NULL')) {
                return [];
            }
            if (sql.includes('COALESCE(MAX(position), 0) + 1 AS next_pos') && params?.[0] === 'day-1') {
                return [{ next_pos: 3 }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise')) {
                return [{ id: String(params?.[0] ?? 'day-ex-new'), program_day_id: 'day-1', position: 3, deleted_at: null }];
            }
            return [];
        });

        addExerciseToDay({ dayId: 'day-1', exerciseId: 'ex-1' });

        const call = (enqueueOutboxOp as jest.Mock).mock.calls[0]?.[0];
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'program_day_exercise',
                opType: 'upsert',
            }),
        );
        expect(call?.entityId).toBeTruthy();
    });

    it('enqueues program_day_exercise upsert snapshots for all reordered rows whose position changed', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM program_day_exercise') && sql.includes('deleted_at IS NOT NULL')) {
                return [];
            }
            if (sql.includes('SELECT id, position') && sql.includes('deleted_at IS NULL')) {
                return [
                    { id: 'day-ex-1', position: 1 },
                    { id: 'day-ex-2', position: 2 },
                    { id: 'day-ex-3', position: 3 },
                ];
            }
            if (
                sql.includes('SELECT *') &&
                sql.includes('FROM program_day_exercise') &&
                params?.[0] === 'day-ex-2'
            ) {
                return [{ id: 'day-ex-2', program_day_id: 'day-1', position: 1 }];
            }
            if (
                sql.includes('SELECT *') &&
                sql.includes('FROM program_day_exercise') &&
                params?.[0] === 'day-ex-1'
            ) {
                return [{ id: 'day-ex-1', program_day_id: 'day-1', position: 2 }];
            }
            return [];
        });

        reorderDayExercises('day-1', ['day-ex-2', 'day-ex-1', 'day-ex-3']);

        expect(enqueueOutboxOp).toHaveBeenCalledTimes(2);
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                entityType: 'program_day_exercise',
                entityId: 'day-ex-2',
                opType: 'upsert',
            }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                entityType: 'program_day_exercise',
                entityId: 'day-ex-1',
                opType: 'upsert',
            }),
        );
    });
    it('enqueues delete tombstones for deleteDay cascades and upserts for compacted siblings', () => {
        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('SELECT program_week_id') && params?.[0] === 'day-2') {
                return [{ program_week_id: 'week-1' }];
            }
            if (
                sql.includes('FROM program_day_exercise') &&
                sql.includes('program_day_id = ?') &&
                sql.includes('deleted_at IS NULL') &&
                params?.[0] === 'day-2'
            ) {
                return [{ id: 'day-ex-21' }, { id: 'day-ex-22' }];
            }
            if (sql.includes('FROM planned_set') && sql.includes('deleted_at IS NULL') && params?.[0] === 'day-ex-21') {
                return [{ id: 'ps-211' }];
            }
            if (sql.includes('FROM planned_set') && sql.includes('deleted_at IS NULL') && params?.[0] === 'day-ex-22') {
                return [{ id: 'ps-221' }, { id: 'ps-222' }];
            }
            if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) {
                return [];
            }
            if (sql.includes('COALESCE(MIN(day_index), 0) AS min_idx')) {
                return [{ min_idx: 1 }];
            }
            if (
                sql.includes('FROM program_day') &&
                sql.includes('program_week_id = ?') &&
                sql.includes('deleted_at IS NULL') &&
                sql.includes('ORDER BY day_index ASC')
            ) {
                return [{ id: 'day-1' }, { id: 'day-3' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'ps-211') {
                return [{ id: 'ps-211', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'ps-221') {
                return [{ id: 'ps-221', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'ps-222') {
                return [{ id: 'ps-222', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'day-ex-21') {
                return [{ id: 'day-ex-21', program_day_id: 'day-2', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'day-ex-22') {
                return [{ id: 'day-ex-22', program_day_id: 'day-2', deleted_at: '2026-04-16 00:00:00' }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-2') {
                return [{ id: 'day-2', deleted_at: '2026-04-16 00:00:00', day_index: 0 }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
                return [{ id: 'day-1', deleted_at: null, day_index: 1 }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-3') {
                return [{ id: 'day-3', deleted_at: null, day_index: 2 }];
            }
            return [];
        });

        deleteDay('day-2');

        expect(enqueueOutboxOp).toHaveBeenCalledTimes(8);
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ entityType: 'planned_set', entityId: 'ps-211', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ entityType: 'program_day_exercise', entityId: 'day-ex-21', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            5,
            expect.objectContaining({ entityType: 'program_day_exercise', entityId: 'day-ex-22', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            6,
            expect.objectContaining({ entityType: 'program_day', entityId: 'day-2', opType: 'delete' }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            7,
            expect.objectContaining({ entityType: 'program_day', entityId: 'day-1', opType: 'upsert' }),
        );
        expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
            8,
            expect.objectContaining({ entityType: 'program_day', entityId: 'day-3', opType: 'upsert' }),
        );
    });
});