jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

import { exec, query } from '../db';
import {
  getUnfinishedWorkoutRemindersEnabled,
  getUnfinishedWorkoutReminderState,
  setUnfinishedWorkoutRemindersEnabled,
  setUnfinishedWorkoutReminderState,
} from '../appMetaRepo';

describe('unfinished workout reminder app_meta helpers', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
  });

  it('stores and parses reminder metadata', () => {
    const state = {
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    };

    setUnfinishedWorkoutReminderState(state);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_meta'), [
      'unfinished_workout_reminder_v1',
      JSON.stringify(state),
    ]);

    (query as jest.Mock).mockReturnValueOnce([{ value: JSON.stringify(state) }]);

    expect(getUnfinishedWorkoutReminderState()).toEqual(state);
  });

  it('clears reminder metadata', () => {
    setUnfinishedWorkoutReminderState(null);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), [
      'unfinished_workout_reminder_v1',
    ]);
  });

  it('returns null for invalid reminder metadata', () => {
    (query as jest.Mock).mockReturnValueOnce([{ value: '{not-json' }]);
    expect(getUnfinishedWorkoutReminderState()).toBeNull();

    (query as jest.Mock).mockReturnValueOnce([
      { value: JSON.stringify({ notificationId: 'notification-1' }) },
    ]);
    expect(getUnfinishedWorkoutReminderState()).toBeNull();
  });

  it('defaults unfinished workout reminders to enabled and stores local preference', () => {
    (query as jest.Mock).mockReturnValueOnce([]);
    expect(getUnfinishedWorkoutRemindersEnabled()).toBe(true);

    (query as jest.Mock).mockReturnValueOnce([{ value: '0' }]);
    expect(getUnfinishedWorkoutRemindersEnabled()).toBe(false);

    setUnfinishedWorkoutRemindersEnabled(false);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_meta'), [
      'unfinished_workout_reminders_enabled_v1',
      '0',
    ]);

    setUnfinishedWorkoutRemindersEnabled(true);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_meta'), [
      'unfinished_workout_reminders_enabled_v1',
      '1',
    ]);
  });
});
