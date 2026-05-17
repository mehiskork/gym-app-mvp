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

import { exec, query } from '../db';
import { newId } from '../../utils/ids';
import { enqueueOutboxOp } from '../outboxRepo';
import { getPrebuiltPlanPreview, importPrebuiltPlan } from '../prebuiltPlansRepo';

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
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_week') &&
        params?.[0] === 'week-1'
      ) {
        return [{ id: 'week-1', program_id: 'program-1', deleted_at: null }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
        return [{ id: 'day-1', program_week_id: 'week-1', deleted_at: null }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-2') {
        return [{ id: 'day-2', program_week_id: 'week-1', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'pde-1'
      ) {
        return [{ id: 'pde-1', program_day_id: 'day-1', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'pde-2'
      ) {
        return [{ id: 'pde-2', program_day_id: 'day-1', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'pde-3'
      ) {
        return [{ id: 'pde-3', program_day_id: 'day-2', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'pde-4'
      ) {
        return [{ id: 'pde-4', program_day_id: 'day-2', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM planned_set') &&
        params?.[0] === 'pset-1'
      ) {
        return [{ id: 'pset-1', program_day_exercise_id: 'pde-1', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM planned_set') &&
        params?.[0] === 'pset-2'
      ) {
        return [{ id: 'pset-2', program_day_exercise_id: 'pde-1', deleted_at: null }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM planned_set') &&
        params?.[0] === 'pset-3'
      ) {
        return [{ id: 'pset-3', program_day_exercise_id: 'pde-3', deleted_at: null }];
      }
      return [];
    });

    importPrebuiltPlan('prebuilt_v_taper_project_3_day');

    const plannedSetInserts = (exec as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO planned_set'),
    );
    expect(plannedSetInserts[0]?.[1]).toEqual(['pset-1', 'pde-1', 1, 6, 6, null]);

    expect(enqueueOutboxOp).toHaveBeenCalled();
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'program', entityId: 'program-1', opType: 'upsert' }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'program_week', entityId: 'week-1', opType: 'upsert' }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program_day_exercise',
        entityId: 'pde-1',
        opType: 'upsert',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'planned_set', entityId: 'pset-1', opType: 'upsert' }),
    );
  });

  it('returns a read-only preview with all sessions and exercise names', () => {
    (exec as jest.Mock).mockClear();
    (enqueueOutboxOp as jest.Mock).mockClear();
    (query as jest.Mock).mockReturnValue([]);

    const preview = getPrebuiltPlanPreview('prebuilt_v_taper_project_3_day');

    expect(preview?.name).toBe('V-Taper Project');
    expect(preview?.sessionCount).toBe(3);
    expect(preview?.sessions.map((session) => session.name)).toEqual([
      'Session 1 – Horizontal Strength',
      'Session 2 – Vertical Strength',
      'Session 3 – Upper Volume / Hypertrophy',
    ]);
    expect(preview?.sessions[0]?.exercises.map((exercise) => exercise.name)).toEqual([
      'Barbell Bench Press',
      'Barbell Bent-Over Row',
      'Incline Dumbbell Press',
      'Pull-Up',
      'Lateral Raises',
      'Face Pull',
      'Triceps Pushdown',
      'Dumbbell Bicep Curl',
    ]);
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });

  it('returns null for an unknown preview template', () => {
    (exec as jest.Mock).mockClear();
    (enqueueOutboxOp as jest.Mock).mockClear();
    (query as jest.Mock).mockReturnValue([]);

    expect(getPrebuiltPlanPreview('missing-template')).toBeNull();
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });

  it('falls back to Unknown exercise when preview exercise names are unavailable', () => {
    jest.resetModules();
    jest.doMock('../db', () => ({
      exec: jest.fn(),
      query: jest.fn(() => []),
    }));
    jest.doMock('../tx', () => ({
      inTransaction: (fn: () => unknown) => fn(),
    }));
    jest.doMock('../../utils/ids', () => ({
      newId: jest.fn(),
    }));
    jest.doMock('../outboxRepo', () => ({
      enqueueOutboxOp: jest.fn(),
    }));
    jest.doMock('../seed/curated_exercises.json', () => []);

    const { getPrebuiltPlanPreview: getPreviewWithMissingNames } = require('../prebuiltPlansRepo');

    const preview = getPreviewWithMissingNames('prebuilt_v_taper_project_3_day');

    expect(preview.sessions[0].exercises[0].name).toBe('Unknown exercise');
  });
});
