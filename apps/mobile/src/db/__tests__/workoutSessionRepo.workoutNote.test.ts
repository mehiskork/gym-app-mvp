jest.mock('../db', () => ({ exec: jest.fn(), query: jest.fn() }));
jest.mock('../tx', () => ({ inTransaction: (fn: () => unknown) => fn() }));
jest.mock('../prRepo', () => ({ detectAndStorePrsForSession: jest.fn() }));
jest.mock('../outboxRepo', () => ({ enqueueOutboxOp: jest.fn() }));

import { exec, query } from '../db';
import { detectAndStorePrsForSession } from '../prRepo';
import { enqueueOutboxOp } from '../outboxRepo';
import { completeSession, updateWorkoutSessionNote } from '../workoutSessionRepo';

describe('workoutSessionRepo workout note', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockReturnValue([{ id: 'ws-1', workout_note: null }]);
  });

  it('stores in-progress draft note and truncates to 200 chars', () => {
    updateWorkoutSessionNote('ws-1', 'x'.repeat(250));

    expect(exec).toHaveBeenCalledTimes(1);
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual(['x'.repeat(200), 'ws-1']);
  });

  it('completes workout with trimmed note and triggers PR detection', () => {
    (query as jest.Mock).mockReturnValueOnce([{ n: 1 }]).mockReturnValue([{ id: 'ws-1' }]);

    completeSession('ws-1', '  Great session  ');

    expect(exec).toHaveBeenCalledTimes(2);
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual(['Great session', 'ws-1']);
    expect(exec).toHaveBeenCalledWith(
      'DELETE FROM workout_session_initial_snapshot WHERE workout_session_id = ?;',
      ['ws-1'],
    );
    expect(detectAndStorePrsForSession).toHaveBeenCalledWith('ws-1');
  });

  it('completes workout with final title in the completion update and outbox snapshot', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ n: 1 }])
      .mockReturnValueOnce([{ id: 'ws-1', title: 'Pull', status: 'completed' }]);

    completeSession('ws-1', '  Great session  ', '  Pull  ');

    expect(exec).toHaveBeenCalledTimes(2);
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual(['Pull', 'Great session', 'ws-1']);
    expect(String((exec as jest.Mock).mock.calls[0][0])).toContain('SET title = ?');
    expect(String((exec as jest.Mock).mock.calls[0][0])).toContain("status = 'completed'");
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session',
        entityId: 'ws-1',
        opType: 'upsert',
        payloadJson: JSON.stringify({ id: 'ws-1', title: 'Pull', status: 'completed' }),
      }),
    );
  });

  it('does not complete workouts with no logged work', () => {
    (query as jest.Mock).mockReturnValueOnce([{ n: 0 }]);

    const completed = completeSession('ws-1', 'No work', 'Pull');

    expect(completed).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
    expect(detectAndStorePrsForSession).not.toHaveBeenCalled();
  });
});
