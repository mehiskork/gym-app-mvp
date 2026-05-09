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

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  cancelUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
}));

import { query } from '../db';
import { cancelUnfinishedWorkoutReminder } from '../../utils/unfinishedWorkoutReminderNotifications';
import { completeSession, discardSession } from '../workoutSessionRepo';

describe('workoutSessionRepo unfinished workout reminder lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels unfinished workout reminder after completing a session', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'ws-1' }]);

    completeSession('ws-1');

    expect(cancelUnfinishedWorkoutReminder).toHaveBeenCalledTimes(1);
  });

  it('cancels unfinished workout reminder after discarding a session', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'set-1' }])
      .mockReturnValueOnce([{ id: 'wse-1' }])
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValue([{ id: 'snapshot' }]);

    discardSession('ws-1');

    expect(cancelUnfinishedWorkoutReminder).toHaveBeenCalledTimes(1);
  });

  it('does not block completion or discard when cancellation rejects', () => {
    (cancelUnfinishedWorkoutReminder as jest.Mock).mockRejectedValue(new Error('cancel failed'));
    (query as jest.Mock).mockReturnValue([{ id: 'snapshot' }]);

    expect(() => completeSession('ws-1')).not.toThrow();
    expect(() => discardSession('ws-1')).not.toThrow();
  });
});
