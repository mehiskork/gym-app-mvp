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
import { addExerciseToDay } from '../dayExerciseRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  WorkoutLimitError,
  WORKOUT_LIMIT_MESSAGES,
} from '../workoutLimits';

describe('addExerciseToDay limits', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset().mockReturnValue('day-ex-new');
    (enqueueOutboxOp as jest.Mock).mockReset();
  });

  it('allows adding the 50th active planned exercise', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('COUNT(*) AS n')) return [{ n: MAX_EXERCISES_PER_SESSION - 1 }];
      if (sql.includes('MAX(position)')) return [{ next_pos: MAX_EXERCISES_PER_SESSION }];
      if (sql.includes('SELECT exercise_type') && params?.[0] === 'ex-50') {
        return [{ exercise_type: 'cardio' }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'day-ex-new'
      ) {
        return [{ id: 'day-ex-new' }];
      }
      return [];
    });

    expect(addExerciseToDay({ dayId: 'day-1', exerciseId: 'ex-50' })).toBe('day-ex-new');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO program_day_exercise'), [
      'day-ex-new',
      'day-1',
      'ex-50',
      MAX_EXERCISES_PER_SESSION,
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'program_day_exercise', entityId: 'day-ex-new' }),
    );
  });

  it('rejects the 51st active planned exercise without inserting or enqueueing outbox', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('COUNT(*) AS n')) return [{ n: MAX_EXERCISES_PER_SESSION }];
      return [];
    });

    let thrown: unknown;
    try {
      addExerciseToDay({ dayId: 'day-1', exerciseId: 'ex-51' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkoutLimitError);
    expect((thrown as Error).message).toBe(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    expect(exec).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO program_day_exercise'),
      expect.any(Array),
    );
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
    expect(newId).not.toHaveBeenCalled();
  });

  it('does not count tombstoned planned exercises after deleted-position normalization', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('deleted_at IS NOT NULL')) return [{ id: 'day-ex-deleted' }];
      if (sql.includes('MIN(position)')) return [{ min_pos: -1000 }];
      if (sql.includes('COUNT(*) AS n')) return [{ n: MAX_EXERCISES_PER_SESSION - 1 }];
      if (sql.includes('MAX(position)')) return [{ next_pos: MAX_EXERCISES_PER_SESSION + 1 }];
      if (sql.includes('SELECT exercise_type') && params?.[0] === 'ex-new') {
        return [{ exercise_type: 'cardio' }];
      }
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM program_day_exercise') &&
        params?.[0] === 'day-ex-new'
      ) {
        return [{ id: 'day-ex-new' }];
      }
      return [];
    });

    addExerciseToDay({ dayId: 'day-1', exerciseId: 'ex-new' });

    expect(exec).toHaveBeenCalledWith('UPDATE program_day_exercise SET position = ? WHERE id = ?', [
      -2001,
      'day-ex-deleted',
    ]);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO program_day_exercise'), [
      'day-ex-new',
      'day-1',
      'ex-new',
      MAX_EXERCISES_PER_SESSION + 1,
    ]);
  });
});
