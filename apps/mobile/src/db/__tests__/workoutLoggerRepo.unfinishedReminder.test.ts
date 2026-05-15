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

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  reconcileUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
  scheduleUnfinishedWorkoutReminderForSession: jest.fn(() => Promise.resolve()),
}));

import { exec, query } from '../db';
import {
  reconcileUnfinishedWorkoutReminder,
  scheduleUnfinishedWorkoutReminderForSession,
} from '../../utils/unfinishedWorkoutReminderNotifications';
import { enqueueOutboxOp } from '../outboxRepo';
import { updateWorkoutSet } from '../workoutLoggerRepo';

describe('workoutLoggerRepo unfinished workout reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-05-09T11:00:00.000Z');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSetUpdateQueries(isCompleted: number) {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'set-1' }]).mockReturnValueOnce([
      {
        is_completed: isCompleted,
        session_id: 'ws-1',
        status: 'in_progress',
      },
    ]);
  }

  it('checking a set completed schedules an unfinished workout reminder', () => {
    mockSetUpdateQueries(1);

    updateWorkoutSet('set-1', { is_completed: 1 });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE workout_set'), [1, 'set-1']);
    expect(scheduleUnfinishedWorkoutReminderForSession).toHaveBeenCalledWith(
      'ws-1',
      '2026-05-09T11:00:00.000Z',
    );
    expect(reconcileUnfinishedWorkoutReminder).not.toHaveBeenCalled();
  });

  it('editing an already completed set reschedules the reminder from the edit action', () => {
    mockSetUpdateQueries(1);

    updateWorkoutSet('set-1', { weight: 120 });

    expect(scheduleUnfinishedWorkoutReminderForSession).toHaveBeenCalledWith(
      'ws-1',
      '2026-05-09T11:00:00.000Z',
    );
  });

  it('weight update writes only weight and snapshots the current completed row', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          weight: 120,
          reps: 5,
          is_completed: 1,
          updated_at: '2026-05-09 11:00:00',
        },
      ])
      .mockReturnValueOnce([
        {
          is_completed: 1,
          session_id: 'ws-1',
          status: 'in_progress',
        },
      ]);

    updateWorkoutSet('set-1', { weight: 120 });

    const updateCall = (exec as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE workout_set'),
    );
    expect(updateCall?.[0]).toContain('SET weight = ?');
    expect(updateCall?.[0]).not.toContain('is_completed = ?');
    expect(updateCall?.[1]).toEqual([120, 'set-1']);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
      }),
    );
    const payload = JSON.parse((enqueueOutboxOp as jest.Mock).mock.calls[0][0].payloadJson);
    expect(payload).toMatchObject({ weight: 120, reps: 5, is_completed: 1 });
  });

  it('completion update snapshots is_completed=1', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          weight: 100,
          reps: 5,
          is_completed: 1,
          updated_at: '2026-05-09 11:00:00',
        },
      ])
      .mockReturnValueOnce([
        {
          is_completed: 1,
          session_id: 'ws-1',
          status: 'in_progress',
        },
      ]);

    updateWorkoutSet('set-1', { is_completed: 1 });

    const payload = JSON.parse((enqueueOutboxOp as jest.Mock).mock.calls[0][0].payloadJson);
    expect(payload).toMatchObject({ id: 'set-1', is_completed: 1 });
  });

  it('unchecking a set reconciles based on remaining completed sets', () => {
    mockSetUpdateQueries(0);

    updateWorkoutSet('set-1', { is_completed: 0 });

    expect(reconcileUnfinishedWorkoutReminder).toHaveBeenCalledTimes(1);
    expect(scheduleUnfinishedWorkoutReminderForSession).not.toHaveBeenCalled();
  });

  it('does not schedule for completed sessions', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'set-1' }]).mockReturnValueOnce([
      {
        is_completed: 1,
        session_id: 'ws-1',
        status: 'completed',
      },
    ]);

    updateWorkoutSet('set-1', { weight: 120 });

    expect(scheduleUnfinishedWorkoutReminderForSession).not.toHaveBeenCalled();
    expect(reconcileUnfinishedWorkoutReminder).not.toHaveBeenCalled();
  });

  it('does not fail set update when reminder scheduling rejects', () => {
    mockSetUpdateQueries(1);
    (scheduleUnfinishedWorkoutReminderForSession as jest.Mock).mockRejectedValueOnce(
      new Error('schedule failed'),
    );

    expect(() => updateWorkoutSet('set-1', { is_completed: 1 })).not.toThrow();
  });
});
