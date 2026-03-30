jest.mock('../db', () => ({ exec: jest.fn(), query: jest.fn() }));
jest.mock('../tx', () => ({ inTransaction: (fn: () => unknown) => fn() }));
jest.mock('../prRepo', () => ({ detectAndStorePrsForSession: jest.fn() }));
jest.mock('../outboxRepo', () => ({ enqueueOutboxOp: jest.fn() }));

import { exec, query } from '../db';
import { detectAndStorePrsForSession } from '../prRepo';
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
    completeSession('ws-1', '  Great session  ');

    expect(exec).toHaveBeenCalledTimes(1);
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual(['Great session', 'ws-1']);
    expect(detectAndStorePrsForSession).toHaveBeenCalledWith('ws-1');
  });
});
