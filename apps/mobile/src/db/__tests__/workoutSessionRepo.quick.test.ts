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

jest.mock('../prRepo', () => ({
  detectAndStorePrsForSession: jest.fn(),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(),
}));

import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import { newId } from '../../utils/ids';
import {
  cleanupLegacyEmptyActiveQuickWorkouts,
  createQuickWorkoutSessionWithExercise,
  getInProgressSession,
} from '../workoutSessionRepo';

describe('Quick Workout session lifecycle', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset();
  });

  it('ignores empty active Quick Workouts when selecting the active session', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM workout_session ws')) return [];
      if (sql.includes('FROM workout_session') && sql.includes('EXISTS')) return [];
      return [];
    });

    expect(getInProgressSession()).toBeNull();
    expect(String((query as jest.Mock).mock.calls.at(-1)?.[0])).toContain('EXISTS');
  });

  it('cleans up legacy empty active Quick Workouts and enqueues delete snapshots', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session ws')) {
        expect(sql).toContain('source_workout_plan_id IS NULL');
        expect(sql).toContain('source_program_day_id IS NULL');
        expect(sql).toContain('NOT EXISTS');
        return [{ id: 'legacy-empty-quick' }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
        return [
          {
            id: params?.[0],
            source_workout_plan_id: null,
            source_program_day_id: null,
            title: 'Renamed Ad Hoc',
            status: 'discarded',
            deleted_at: 'now',
          },
        ];
      }
      return [];
    });

    expect(cleanupLegacyEmptyActiveQuickWorkouts()).toEqual(['legacy-empty-quick']);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE workout_session'), [
      'legacy-empty-quick',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session',
        entityId: 'legacy-empty-quick',
        opType: 'delete',
        payloadJson: expect.stringContaining('Renamed Ad Hoc'),
      }),
    );
  });

  it('creates a Quick Workout with the first strength exercise and default set atomically', () => {
    (newId as jest.Mock)
      .mockReturnValueOnce('ws-quick-1')
      .mockReturnValueOnce('wse-quick-1')
      .mockReturnValueOnce('set-quick-1');
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session ws')) return [{ id: 'legacy-empty-quick' }];
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
        return [{ id: params?.[0], source_workout_plan_id: null, source_program_day_id: null }];
      }
      if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
        return [];
      }
      if (sql.includes('FROM exercise')) {
        return [{ exercise_type: 'strength', cardio_profile: null }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
        return [{ id: params?.[0], workout_session_id: 'ws-quick-1' }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_set')) {
        return [{ id: params?.[0], workout_session_exercise_id: 'wse-quick-1' }];
      }
      return [];
    });

    const result = createQuickWorkoutSessionWithExercise({
      exerciseId: 'ex-bench',
      exerciseName: 'Bench Press',
    });

    expect(result).toEqual({ sessionId: 'ws-quick-1', focusExerciseId: 'wse-quick-1' });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE workout_session'), [
      'legacy-empty-quick',
    ]);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workout_session'), [
      'ws-quick-1',
      'Quick Workout',
    ]);
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-quick-1', 'ws-quick-1', 'ex-bench', 'Bench Press', 'strength', null],
    );
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workout_set'), [
      'set-quick-1',
      'wse-quick-1',
      90,
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'workout_session', entityId: 'ws-quick-1' }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-quick-1',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'workout_set', entityId: 'set-quick-1' }),
    );
  });

  it('creates a Quick Workout with the first cardio exercise without a default set', () => {
    (newId as jest.Mock).mockReturnValueOnce('ws-cardio-1').mockReturnValueOnce('wse-cardio-1');
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session ws')) return [];
      if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
        return [];
      }
      if (sql.includes('FROM exercise')) {
        return [{ exercise_type: 'cardio', cardio_profile: 'bike' }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session')) {
        return [{ id: params?.[0], source_workout_plan_id: null, source_program_day_id: null }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
        return [{ id: params?.[0], workout_session_id: 'ws-cardio-1' }];
      }
      return [];
    });

    const result = createQuickWorkoutSessionWithExercise({
      exerciseId: 'ex-bike',
      exerciseName: 'Bike',
    });

    expect(result).toEqual({ sessionId: 'ws-cardio-1', focusExerciseId: 'wse-cardio-1' });
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-cardio-1', 'ws-cardio-1', 'ex-bike', 'Bike', 'cardio', 'bike'],
    );
    expect(
      (exec as jest.Mock).mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO workout_set'),
      ),
    ).toBe(false);
  });
});
