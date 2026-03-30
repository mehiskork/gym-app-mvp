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
import { updateWorkoutSessionExerciseComment } from '../workoutLoggerRepo';

describe('updateWorkoutSessionExerciseComment', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
  });

  it('adds or edits comment for in-progress sessions', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress' }])
      .mockReturnValueOnce([{ id: 'wse-1', notes: 'warm up elbows' }]);

    updateWorkoutSessionExerciseComment('wse-1', ' warm up elbows ');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET notes = ?'), [
      'warm up elbows',
      'wse-1',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-1',
        opType: 'upsert',
      }),
    );
  });

  it('clears comment for in-progress sessions', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress' }])
      .mockReturnValueOnce([{ id: 'wse-1', notes: null }]);

    updateWorkoutSessionExerciseComment('wse-1', '   ');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET notes = ?'), [null, 'wse-1']);
  });

  it('does not update comment for completed sessions', () => {
    (query as jest.Mock).mockReturnValueOnce([{ status: 'completed' }]);

    updateWorkoutSessionExerciseComment('wse-1', 'keep elbows tucked');

    expect(exec).not.toHaveBeenCalled();
  });

  it('enforces a 200-character max length', () => {
    const longComment = 'a'.repeat(220);
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress' }])
      .mockReturnValueOnce([{ id: 'wse-1', notes: 'a'.repeat(200) }]);

    updateWorkoutSessionExerciseComment('wse-1', longComment);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET notes = ?'), [
      'a'.repeat(200),
      'wse-1',
    ]);
  });
});
