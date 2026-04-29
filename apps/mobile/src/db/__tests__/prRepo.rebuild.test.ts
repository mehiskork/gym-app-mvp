jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(() => 'pr-new'),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));

import { exec, query } from '../db';
import { inTransaction } from '../tx';
import { enqueueOutboxOp } from '../outboxRepo';
import { rebuildPrEventsFromWorkoutHistory } from '../prRepo';

describe('prRepo local derived cache rebuild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rebuilds local PR cache from completed workout history without outbox ops', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM workout_session') && sql.includes('ORDER BY COALESCE')) {
        return [{ id: 'session-1' }];
      }
      if (sql.includes('FROM workout_session_exercise') && sql.includes('ORDER BY position')) {
        return [{ wse_id: 'wse-1', exercise_id: 'exercise-1' }];
      }
      if (sql.includes('FROM workout_set') && sql.includes('ORDER BY set_index')) {
        return [{ weight: 100, reps: 5, is_completed: 1 }];
      }
      if (sql.includes('SELECT MAX(ws.weight)')) return [{ v: null }];
      if (sql.includes('SELECT MAX(v)')) return [{ v: null }];
      if (sql.includes('SELECT MAX(ws.reps)')) return [{ v: null }];
      if (sql.includes('SELECT changes() AS n')) return [{ n: 1 }];
      return [];
    });

    const inserted = rebuildPrEventsFromWorkoutHistory();

    expect(inserted).toBe(3);
    expect(inTransaction).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('DELETE FROM pr_event;');
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO pr_event'),
      expect.any(Array),
    );
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });
});
