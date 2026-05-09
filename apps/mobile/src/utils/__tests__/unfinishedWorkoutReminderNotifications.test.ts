jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock(
  'expo-notifications',
  () => ({
    AndroidImportance: { HIGH: 'high' },
    setNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
    cancelScheduledNotificationAsync: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('../../db/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getUnfinishedWorkoutReminderState: jest.fn(),
  setUnfinishedWorkoutReminderState: jest.fn(),
}));

jest.mock('../logger', () => ({
  logEvent: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { query } from '../../db/db';
import {
  getUnfinishedWorkoutReminderState,
  setUnfinishedWorkoutReminderState,
} from '../../db/appMetaRepo';
import { logEvent } from '../logger';
import {
  cancelUnfinishedWorkoutReminder,
  reconcileUnfinishedWorkoutReminder,
  resetUnfinishedWorkoutReminderStateForTests,
  scheduleUnfinishedWorkoutReminderForSession,
  UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
} from '../unfinishedWorkoutReminderNotifications';

describe('unfinishedWorkoutReminderNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-09T11:30:00.000Z'));
    resetUnfinishedWorkoutReminderStateForTests();
    (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(null);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-1');
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(null);
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('schedules with expected copy, channel, and one-hour trigger when permission is granted', async () => {
    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
      {
        name: 'Workout reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
      },
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Finish your workout?',
        body: "You have logged sets in TrainFrame but haven't finished this workout yet.",
        channelId: UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
      },
      trigger: { seconds: 1800, type: 'timeInterval' },
    });
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });
  });

  it('does not schedule when permission is denied or undetermined', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);

    jest.clearAllMocks();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'undetermined',
    });

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('cancels previous notification before replacement', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'old-notification',
      sessionId: 'ws-old',
      dueAt: '2026-05-09T10:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T09:00:00.000Z',
    });

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-notification');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('clears metadata on cancel', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });

    await cancelUnfinishedWorkoutReminder();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('handles schedule and cancel failures safely', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('schedule failed'),
    );
    await expect(
      scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z'),
    ).resolves.toBeUndefined();
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'notifications',
      'Unfinished workout reminder scheduling failed',
      expect.any(Object),
    );

    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('cancel failed'),
    );

    await expect(cancelUnfinishedWorkoutReminder()).resolves.toBeUndefined();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('reconciles from current in-progress completed set data', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09 11:00:00' },
    ]);

    await reconcileUnfinishedWorkoutReminder();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { seconds: 1800, type: 'timeInterval' },
      }),
    );
  });

  it('cancels stale reminder when reconciliation finds no qualifying workout', async () => {
    (query as jest.Mock).mockReturnValueOnce([]);
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });

    await reconcileUnfinishedWorkoutReminder();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });
});
