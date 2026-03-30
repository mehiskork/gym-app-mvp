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

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(),
}));

jest.mock('../prRepo', () => ({
  detectAndStorePrsForSession: jest.fn(),
}));

import { exec, query } from '../db';
import { newId } from '../../utils/ids';
import { createSessionFromPlanDay } from '../workoutSessionRepo';

describe('createSessionFromPlanDay cardio behavior', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (newId as jest.Mock)
      .mockReset()
      .mockReturnValueOnce('ws-1')
      .mockReturnValueOnce('wse-cardio')
      .mockReturnValueOnce('wse-strength')
      .mockReturnValueOnce('set-1');
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM workout_session_exercise') && sql.includes('WHERE id = ?')) {
        return [{ id: 'wse' }];
      }
      if (sql.includes('FROM workout_set') && sql.includes('WHERE id = ?')) {
        return [{ id: 'set-1' }];
      }
      if (sql.includes('FROM workout_session') && sql.includes('WHERE id = ?')) {
        return [{ id: 'ws-1' }];
      }
      return [];
    });
  });

  it('creates cardio session exercise without prefill/strength set rows', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ day_name: 'Mixed Day', day_index: 1 }])
      .mockReturnValueOnce([
        {
          day_exercise_id: 'pde-1',
          exercise_id: 'ex_treadmill_run',
          exercise_name: 'Treadmill',
          exercise_type: 'cardio',
          cardio_profile: 'treadmill',
          position: 1,
        },
        {
          day_exercise_id: 'pde-2',
          exercise_id: 'ex_bench_press_barbell',
          exercise_name: 'Barbell Bench Press',
          exercise_type: 'strength',
          cardio_profile: null,
          position: 2,
        },
      ])
      .mockReturnValueOnce([{ set_index: 1, target_reps_min: 5, rest_seconds: 120 }])
      .mockReturnValueOnce([]);

    createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

    const workoutSetInserts = (exec as jest.Mock).mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes('INSERT INTO workout_set'));
    expect(workoutSetInserts).toHaveLength(1);
    expect(
      (exec as jest.Mock).mock.calls.some((call) => String(call[0]).includes('exercise_type')),
    ).toBe(true);
  });
  it('uses Session fallback title when day name is null', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ day_name: null, day_index: 4 }])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

    const sessionInsert = (exec as jest.Mock).mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO workout_session'),
    );
    expect(sessionInsert?.[1]).toEqual(['ws-1', 'plan-1', 'day-1', 'Session 4']);
  });
});
