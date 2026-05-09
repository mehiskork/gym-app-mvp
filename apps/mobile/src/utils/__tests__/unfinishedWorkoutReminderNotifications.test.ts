jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock(
  'expo-notifications',
  () => ({
    AndroidImportance: { HIGH: 'high' },
    setNotificationChannelAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    getAllScheduledNotificationsAsync: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
    cancelScheduledNotificationAsync: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('../../db/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../db/appMetaRepo', () => ({
  getUnfinishedWorkoutRemindersEnabled: jest.fn(() => true),
  getUnfinishedWorkoutReminderState: jest.fn(),
  setUnfinishedWorkoutRemindersEnabled: jest.fn(),
  setUnfinishedWorkoutReminderState: jest.fn(),
}));

jest.mock('../logger', () => ({
  logEvent: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { query } from '../../db/db';
import {
  getUnfinishedWorkoutRemindersEnabled,
  getUnfinishedWorkoutReminderState,
  setUnfinishedWorkoutRemindersEnabled,
  setUnfinishedWorkoutReminderState,
} from '../../db/appMetaRepo';
import { logEvent } from '../logger';
import {
  cancelUnfinishedWorkoutReminder,
  handleUnfinishedWorkoutReminderNotificationResponse,
  reconcileUnfinishedWorkoutReminder,
  resetUnfinishedWorkoutReminderStateForTests,
  scheduleUnfinishedWorkoutReminderForSession,
  setUnfinishedWorkoutRemindersPreference,
  UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
  UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE,
} from '../unfinishedWorkoutReminderNotifications';

function scheduledReminder(id: string, data: Record<string, unknown> = {}) {
  return {
    identifier: id,
    content: {
      data: {
        type: UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE,
        ...data,
      },
    },
  };
}

function scheduledRestTimer(id: string) {
  return {
    identifier: id,
    content: {
      data: { type: 'rest_timer' },
    },
  };
}

describe('unfinishedWorkoutReminderNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-09T11:30:00.000Z'));
    resetUnfinishedWorkoutReminderStateForTests();
    (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(null);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-1');
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(null);
    (getUnfinishedWorkoutRemindersEnabled as jest.Mock).mockReturnValue(true);
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
        body: 'You have logged sets in TrainFrame but haven’t finished this workout yet.',
        channelId: UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
        data: {
          type: UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE,
          sessionId: 'ws-1',
        },
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

  it('does not schedule replacement when previous notification cancellation fails', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'old-notification',
      sessionId: 'ws-old',
      dueAt: '2026-05-09T10:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T09:00:00.000Z',
    });
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('cancel failed'),
    );

    await expect(
      scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z'),
    ).resolves.toBeUndefined();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-notification');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules normally when there is no existing metadata', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'notification-1', sessionId: 'ws-1' }),
    );
  });

  it('cancels orphaned OS unfinished reminders before scheduling with no metadata', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      scheduledRestTimer('rest-timer-1'),
      scheduledReminder('orphan-reminder', { sessionId: 'ws-old' }),
    ]);

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan-reminder');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('rest-timer-1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('does not schedule if orphaned OS reminder cancellation fails', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      scheduledReminder('orphan-reminder', { sessionId: 'ws-old' }),
    ]);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('orphan cancel failed'),
    );

    await expect(
      scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z'),
    ).resolves.toBeUndefined();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan-reminder');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
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

  it('cancels orphaned OS unfinished reminders on cancel when metadata is missing', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      scheduledRestTimer('rest-timer-1'),
      scheduledReminder('orphan-reminder', { sessionId: 'ws-old' }),
    ]);

    await cancelUnfinishedWorkoutReminder();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan-reminder');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('rest-timer-1');
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

  it('keeps matching metadata when OS scheduled notification still exists', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09T11:00:00.000Z' },
    ]);
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'notification-1' },
    ]);

    await reconcileUnfinishedWorkoutReminder();

    expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).not.toHaveBeenCalledWith(null);
  });

  it('replaces matching metadata when OS scheduled notification is missing', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09T11:00:00.000Z' },
    ]);
    (getUnfinishedWorkoutReminderState as jest.Mock)
      .mockReturnValueOnce({
        notificationId: 'missing-notification',
        sessionId: 'ws-1',
        dueAt: '2026-05-09T12:00:00.000Z',
        lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
      })
      .mockReturnValueOnce(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([]);

    await reconcileUnfinishedWorkoutReminder();

    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(setUnfinishedWorkoutReminderState).toHaveBeenLastCalledWith(
      expect.objectContaining({ notificationId: 'notification-1', sessionId: 'ws-1' }),
    );
  });

  it('does not schedule a duplicate if OS scheduled notification verification fails', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09T11:00:00.000Z' },
    ]);
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValueOnce(
      new Error('verification failed'),
    );

    await expect(reconcileUnfinishedWorkoutReminder()).resolves.toBeUndefined();

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'notifications',
      'Unfinished workout reminder OS verification failed',
      expect.any(Object),
    );
  });

  it('does not replace a missing OS notification when permission is denied', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09T11:00:00.000Z' },
    ]);
    (getUnfinishedWorkoutReminderState as jest.Mock)
      .mockReturnValueOnce({
        notificationId: 'missing-notification',
        sessionId: 'ws-1',
        dueAt: '2026-05-09T12:00:00.000Z',
        lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
      })
      .mockReturnValueOnce(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([]);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    await reconcileUnfinishedWorkoutReminder();

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
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

  it('does not schedule when unfinished workout reminders are disabled', async () => {
    (getUnfinishedWorkoutRemindersEnabled as jest.Mock).mockReturnValue(false);

    await scheduleUnfinishedWorkoutReminderForSession('ws-1', '2026-05-09T11:00:00.000Z');

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('turning off reminder preference cancels current reminder', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue({
      notificationId: 'notification-1',
      sessionId: 'ws-1',
      dueAt: '2026-05-09T12:00:00.000Z',
      lastLoggedSetAt: '2026-05-09T11:00:00.000Z',
    });

    await setUnfinishedWorkoutRemindersPreference(false);

    expect(setUnfinishedWorkoutRemindersEnabled).toHaveBeenCalledWith(false);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('turning off reminder preference cancels orphaned OS unfinished reminders', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      scheduledRestTimer('rest-timer-1'),
      scheduledReminder('orphan-reminder', { sessionId: 'ws-old' }),
    ]);

    await setUnfinishedWorkoutRemindersPreference(false);

    expect(setUnfinishedWorkoutRemindersEnabled).toHaveBeenCalledWith(false);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan-reminder');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('rest-timer-1');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('turning off reminder preference remains safe if orphan cancellation fails', async () => {
    (getUnfinishedWorkoutReminderState as jest.Mock).mockReturnValue(null);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      scheduledReminder('orphan-reminder', { sessionId: 'ws-old' }),
    ]);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(
      new Error('orphan cancel failed'),
    );

    await expect(setUnfinishedWorkoutRemindersPreference(false)).resolves.toBeUndefined();

    expect(setUnfinishedWorkoutRemindersEnabled).toHaveBeenCalledWith(false);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('orphan-reminder');
    expect(setUnfinishedWorkoutReminderState).toHaveBeenCalledWith(null);
  });

  it('turning on reminder preference reconciles current reminder state', async () => {
    (query as jest.Mock).mockReturnValueOnce([
      { session_id: 'ws-1', last_logged_set_at: '2026-05-09T11:00:00.000Z' },
    ]);

    await setUnfinishedWorkoutRemindersPreference(true);

    expect(setUnfinishedWorkoutRemindersEnabled).toHaveBeenCalledWith(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('navigates notification taps to an in-progress session', async () => {
    const navigation = { navigate: jest.fn() };
    (query as jest.Mock).mockReturnValueOnce([{ id: 'ws-1' }]);

    await handleUnfinishedWorkoutReminderNotificationResponse(
      {
        notification: {
          request: {
            content: {
              data: { type: UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE, sessionId: 'ws-1' },
            },
          },
        },
      } as unknown as Notifications.NotificationResponse,
      navigation,
    );

    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'ws-1' });
  });

  it('falls back to Home when notification tap target is stale', async () => {
    const navigation = { navigate: jest.fn() };
    (query as jest.Mock).mockReturnValueOnce([]);

    await handleUnfinishedWorkoutReminderNotificationResponse(
      {
        notification: {
          request: {
            content: {
              data: { type: UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE, sessionId: 'ws-1' },
            },
          },
        },
      } as unknown as Notifications.NotificationResponse,
      navigation,
    );

    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
  });
});
