jest.mock('../db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../tx', () => ({
    inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../../utils/ids', () => ({
    newId: jest.fn(),
}));

jest.mock('../outboxRepo', () => ({
    enqueueOutboxOp: jest.fn(),
}));

import { query } from '../db';
import { newId } from '../../utils/ids';
import { enqueueOutboxOp } from '../outboxRepo';
import { importPrebuiltPlan } from '../prebuiltPlansRepo';

describe('prebuiltPlansRepo outbound sync enqueue coverage', () => {
    beforeEach(() => {
        (query as jest.Mock).mockReset();
        (newId as jest.Mock).mockReset();
        (enqueueOutboxOp as jest.Mock).mockReset();
    });

    it('enqueues planner tree upsert snapshots, including planned_set rows, when importing a prebuilt plan', () => {
        const ids = [
            'program-1',
            'week-1',
            'day-1',
            'pde-1',
            'pset-1',
            'pset-2',
            'pde-2',
            'day-2',
            'pde-3',
            'pset-3',
            'pde-4',
        ];
        (newId as jest.Mock).mockImplementation(() => ids.shift());

        (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
            if (sql.includes('FROM exercise') && sql.includes('WHERE id IN')) {
                return ((params as string[]) ?? []).map((id) => ({ id }));
            }
            if (sql.includes('FROM program') && sql.includes('name = ?')) return [];

            if (sql.includes('SELECT *') && sql.includes('FROM program') && params?.[0] === 'program-1') {
                return [{ id: 'program-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_week') && params?.[0] === 'week-1') {
                return [{ id: 'week-1', program_id: 'program-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
                return [{ id: 'day-1', program_week_id: 'week-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-2') {
                return [{ id: 'day-2', program_week_id: 'week-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'pde-1') {
                return [{ id: 'pde-1', program_day_id: 'day-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'pde-2') {
                return [{ id: 'pde-2', program_day_id: 'day-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'pde-3') {
                return [{ id: 'pde-3', program_day_id: 'day-2', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM program_day_exercise') && params?.[0] === 'pde-4') {
                return [{ id: 'pde-4', program_day_id: 'day-2', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'pset-1') {
                return [{ id: 'pset-1', program_day_exercise_id: 'pde-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'pset-2') {
                return [{ id: 'pset-2', program_day_exercise_id: 'pde-1', deleted_at: null }];
            }
            if (sql.includes('SELECT *') && sql.includes('FROM planned_set') && params?.[0] === 'pset-3') {
                return [{ id: 'pset-3', program_day_exercise_id: 'pde-3', deleted_at: null }];
            }
            return [];
        });

        importPrebuiltPlan('prebuilt_v_taper_project_3_day');

        expect(enqueueOutboxOp).toHaveBeenCalled();
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'program', entityId: 'program-1', opType: 'upsert' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'program_week', entityId: 'week-1', opType: 'upsert' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'program_day_exercise', entityId: 'pde-1', opType: 'upsert' }),
        );
        expect(enqueueOutboxOp).toHaveBeenCalledWith(
            expect.objectContaining({ entityType: 'planned_set', entityId: 'pset-1', opType: 'upsert' }),
        );
    });
});