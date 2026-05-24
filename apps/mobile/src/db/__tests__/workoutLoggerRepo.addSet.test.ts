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

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  reconcileUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
  scheduleUnfinishedWorkoutReminderForSession: jest.fn(() => Promise.resolve()),
}));

import { exec, query } from '../db';
import { newId } from '../../utils/ids';
import { enqueueOutboxOp } from '../outboxRepo';
import { addWorkoutSet } from '../workoutLoggerRepo';
import { MAX_SETS_PER_EXERCISE, WorkoutLimitError, WORKOUT_LIMIT_MESSAGES } from '../workoutLimits';

const createRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `set-${index + 1}` }));

describe('addWorkoutSet limits', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset().mockReturnValue('set-new');
  });

  it('allows adding the 50th active set', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT id') && sql.includes('ORDER BY set_index ASC')) {
        return createRows(MAX_SETS_PER_EXERCISE - 1);
      }
      if (sql.includes('COUNT(*) AS n')) return [{ n: MAX_SETS_PER_EXERCISE - 1 }];
      if (sql.includes('SELECT weight, reps, rpe, rest_seconds')) {
        return [{ weight: 100, reps: 8, rpe: null, rest_seconds: 120 }];
      }
      if (sql.includes('SELECT *') && params?.[0] === 'set-new') return [{ id: 'set-new' }];
      return [];
    });

    expect(addWorkoutSet('wse-1')).toBe('set-new');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workout_set'), [
      'set-new',
      'wse-1',
      MAX_SETS_PER_EXERCISE,
      0,
      8,
      null,
      120,
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'workout_set', entityId: 'set-new' }),
    );
  });

  it('rejects the 51st active set without inserting or enqueueing outbox', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('deleted_at IS NOT NULL')) return [];
      if (sql.includes('SELECT id') && sql.includes('ORDER BY set_index ASC')) {
        return createRows(MAX_SETS_PER_EXERCISE);
      }
      if (sql.includes('COUNT(*) AS n')) return [{ n: MAX_SETS_PER_EXERCISE }];
      return [];
    });

    let thrown: unknown;
    try {
      addWorkoutSet('wse-1');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkoutLimitError);
    expect((thrown as Error).message).toBe(WORKOUT_LIMIT_MESSAGES.maxSetsPerExercise);

    const insertCalls = (exec as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO workout_set'),
    );
    expect(insertCalls).toHaveLength(0);
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
    expect(newId).not.toHaveBeenCalled();
  });
});
