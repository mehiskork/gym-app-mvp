jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(() => 'day-3'),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));


import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import {
  addDayToWorkoutPlan,
  createWorkoutPlan,
  reorderWorkoutPlanDays,
  updateWorkoutPlanName,
} from '../workoutPlanRepo';
import { newId } from '../../utils/ids';

describe('workoutPlanRepo addDayToWorkoutPlan', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset();
    (newId as jest.Mock).mockImplementation(() => 'day-3');
  });

  it('creates newly added days with Session N default naming', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM program_week') && sql.includes('LIMIT 1')) return [{ id: 'week-1' }];
      if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT id, name') && sql.includes('deleted_at IS NULL')) {
        return [
          { id: 'day-1', name: 'Session 1' },
          { id: 'day-2', name: 'Upper Body' },
        ];
      }
      if (sql.includes('COUNT(*) AS n')) return [{ n: 2 }];
      return [];
    });

    addDayToWorkoutPlan('plan-1');

    const insertCall = (exec as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO program_day'),
    );
    expect(insertCall?.[1]).toEqual(['day-3', 'week-1', 3, 'Session 3']);
  });

  it('enqueues program_day upsert snapshot when adding a day to a workout plan', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM program_week') && sql.includes('LIMIT 1')) return [{ id: 'week-1' }];
      if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT id, name') && sql.includes('deleted_at IS NULL')) {
        return [{ id: 'day-1', name: 'Session 1' }];
      }
      if (sql.includes('COUNT(*) AS n')) return [{ n: 1 }];
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-3') {
        return [{ id: 'day-3', program_week_id: 'week-1', day_index: 2 }];
      }
      return [];
    });

    addDayToWorkoutPlan('plan-1');

    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program_day',
        entityId: 'day-3',
        opType: 'upsert',
      }),
    );
  });

  it('enqueues program, week, and day snapshots when creating a workout plan', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT *') && sql.includes('FROM program_week') && params?.[0] === 'week-1') {
        return [{ id: 'week-1', program_id: 'workout_plan-1' }];
      }
      if (sql.includes('FROM program_week') && sql.includes('LIMIT 1')) return [];
      if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT id, name') && sql.includes('deleted_at IS NULL')) return [];
      if (sql.includes('COUNT(*) AS n')) return [{ n: 0 }];
      if (sql.includes('SELECT *') && sql.includes('FROM program') && params?.[0] === 'workout_plan-1') {
        return [{ id: 'workout_plan-1', name: 'Plan A' }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
        return [{ id: 'day-1', program_week_id: 'week-1' }];
      }
      return [];
    });

    (newId as jest.Mock).mockImplementation((prefix: string) => `${prefix}-1`);
    createWorkoutPlan({ name: 'Plan A' });

    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program',
        entityId: 'workout_plan-1',
        opType: 'upsert',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program_week',
        entityId: 'week-1',
        opType: 'upsert',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program_day',
        entityId: 'day-1',
        opType: 'upsert',
      }),
    );
  });
  it('enqueues program snapshot when updating workout plan name', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT *') && sql.includes('FROM program') && params?.[0] === 'plan-1') {
        return [{ id: 'plan-1', name: 'Renamed Plan', deleted_at: null }];
      }
      return [];
    });

    updateWorkoutPlanName('plan-1', 'Renamed Plan');

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE program'),
      ['Renamed Plan', 'plan-1'],
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'program',
        entityId: 'plan-1',
        opType: 'upsert',
      }),
    );
  });

  it('enqueues program_day upsert snapshots for all reordered days whose index changed', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM program_week') && sql.includes('LIMIT 1')) return [{ id: 'week-1' }];
      if (sql.includes('FROM program_day d') && sql.includes('deleted_at IS NULL')) {
        return [
          { id: 'day-1', day_index: 1 },
          { id: 'day-2', day_index: 2 },
          { id: 'day-3', day_index: 3 },
        ];
      }
      if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-2') {
        return [{ id: 'day-2', day_index: 1 }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM program_day') && params?.[0] === 'day-1') {
        return [{ id: 'day-1', day_index: 2 }];
      }
      return [];
    });

    reorderWorkoutPlanDays('plan-1', ['day-2', 'day-1', 'day-3']);

    expect(enqueueOutboxOp).toHaveBeenCalledTimes(2);
    expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entityType: 'program_day',
        entityId: 'day-2',
        opType: 'upsert',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        entityType: 'program_day',
        entityId: 'day-1',
        opType: 'upsert',
      }),
    );
  });
});
