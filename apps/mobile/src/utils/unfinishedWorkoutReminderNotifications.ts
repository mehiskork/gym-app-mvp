import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { query } from '../db/db';
import { WORKOUT_SESSION_STATUS } from '../db/constants';
import {
  getUnfinishedWorkoutRemindersEnabled,
  getUnfinishedWorkoutReminderState,
  setUnfinishedWorkoutRemindersEnabled,
  setUnfinishedWorkoutReminderState,
} from '../db/appMetaRepo';
import type { UnfinishedWorkoutReminderState } from '../db/appMetaRepo';
import { logEvent } from './logger';
import { parseTimestampMs } from './timestamp';

export const UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID = 'unfinished-workout-reminders-v1';
export const UNFINISHED_WORKOUT_REMINDER_DELAY_MS = 60 * 60 * 1000;
export const UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE = 'unfinished_workout_reminder';
export const UNFINISHED_WORKOUT_REMINDER_TITLE = 'Finish your workout?';
export const UNFINISHED_WORKOUT_REMINDER_BODY =
  'You have logged sets in TrainFrame but haven’t finished this workout yet.';

let channelSetupPromise: Promise<void> | null = null;

type QualifyingWorkoutReminderRow = {
  session_id: string;
  last_logged_set_at: string;
};

type ScheduledNotification = Awaited<
  ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>
>[number];

export type ReminderNavigation = {
  navigate: (routeName: string, params?: unknown) => void;
};

function logNotificationWarning(message: string, error: unknown) {
  logEvent('warn', 'notifications', message, {
    error: error instanceof Error ? error.message : String(error),
  });
}

async function ensureUnfinishedWorkoutReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (channelSetupPromise) {
    await channelSetupPromise;
    return;
  }

  channelSetupPromise = Notifications.setNotificationChannelAsync(
    UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
    {
      name: 'Workout reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
    },
  ).then(() => undefined);

  await channelSetupPromise;
}

function getDueAt(lastLoggedSetAt: string): string | null {
  const parsed = parseTimestampMs(lastLoggedSetAt);
  if (parsed === null) return null;
  return new Date(parsed + UNFINISHED_WORKOUT_REMINDER_DELAY_MS).toISOString();
}

function getTriggerSeconds(dueAt: string): number {
  const parsed = parseTimestampMs(dueAt);
  if (parsed === null) return 1;
  return Math.max(1, Math.ceil((parsed - Date.now()) / 1000));
}

async function cancelStoredNotification(
  state: UnfinishedWorkoutReminderState | null,
): Promise<boolean> {
  if (!state?.notificationId) return true;
  try {
    await Notifications.cancelScheduledNotificationAsync(state.notificationId);
    return true;
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder OS cancellation failed', error);
    return false;
  }
}

async function hasScheduledNotification(notificationId: string): Promise<boolean | null> {
  const scheduled = await getScheduledUnfinishedWorkoutNotifications();
  if (scheduled === null) return null;
  return scheduled.some((notification) => notification.identifier === notificationId);
}

function isUnfinishedWorkoutReminderNotification(notification: ScheduledNotification): boolean {
  const data = notification.content.data;
  return Boolean(
    data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE,
  );
}

async function getScheduledUnfinishedWorkoutNotifications(): Promise<
  ScheduledNotification[] | null
> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.filter(isUnfinishedWorkoutReminderNotification);
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder OS verification failed', error);
    return null;
  }
}

async function cancelScheduledUnfinishedWorkoutNotifications(options?: {
  excludeNotificationId?: string | null;
}): Promise<boolean> {
  const scheduled = await getScheduledUnfinishedWorkoutNotifications();
  if (scheduled === null) return false;

  for (const notification of scheduled) {
    if (
      options?.excludeNotificationId &&
      notification.identifier === options.excludeNotificationId
    ) {
      continue;
    }

    const canceled = await cancelStoredNotification({
      notificationId: notification.identifier,
      sessionId: '',
      dueAt: '',
      lastLoggedSetAt: '',
    });
    if (!canceled) return false;
  }

  return true;
}

function getQualifyingWorkoutReminderRow(): QualifyingWorkoutReminderRow | null {
  const row = query<QualifyingWorkoutReminderRow>(
    `
    SELECT
      ws.id AS session_id,
      MAX(wset.updated_at) AS last_logged_set_at
    FROM workout_session ws
    JOIN workout_session_exercise wse
      ON wse.workout_session_id = ws.id
      AND wse.deleted_at IS NULL
    JOIN workout_set wset
      ON wset.workout_session_exercise_id = wse.id
      AND wset.deleted_at IS NULL
      AND wset.is_completed = 1
    WHERE ws.status = ?
      AND ws.deleted_at IS NULL
    GROUP BY ws.id
    ORDER BY ws.started_at DESC
    LIMIT 1;
  `,
    [WORKOUT_SESSION_STATUS.IN_PROGRESS],
  )[0];

  return row?.session_id && row.last_logged_set_at ? row : null;
}

async function scheduleReplacement(input: {
  dueAt: string;
  lastLoggedSetAt: string;
  sessionId: string;
}) {
  if (!getUnfinishedWorkoutRemindersEnabled()) {
    await cancelUnfinishedWorkoutReminder();
    return;
  }

  const permissions = await Notifications.getPermissionsAsync();
  const existing = getUnfinishedWorkoutReminderState();

  if (permissions.status !== 'granted') {
    await cancelStoredNotification(existing);
    setUnfinishedWorkoutReminderState(null);
    setUnfinishedWorkoutRemindersEnabled(false);
    return;
  }

  await ensureUnfinishedWorkoutReminderChannel();
  if (existing?.notificationId) {
    const canceled = await cancelStoredNotification(existing);
    setUnfinishedWorkoutReminderState(null);
    if (!canceled) return;
  }
  const orphanedCanceled = await cancelScheduledUnfinishedWorkoutNotifications();
  if (!orphanedCanceled) {
    setUnfinishedWorkoutReminderState(null);
    return;
  }

  const content = {
    title: UNFINISHED_WORKOUT_REMINDER_TITLE,
    body: UNFINISHED_WORKOUT_REMINDER_BODY,
    channelId: UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
    data: {
      type: UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE,
      sessionId: input.sessionId,
    },
  } as Notifications.NotificationContentInput;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      seconds: getTriggerSeconds(input.dueAt),
      type: 'timeInterval',
    } as Notifications.NotificationTriggerInput,
  });

  setUnfinishedWorkoutReminderState({
    notificationId,
    sessionId: input.sessionId,
    dueAt: input.dueAt,
    lastLoggedSetAt: input.lastLoggedSetAt,
  });
}

export async function scheduleUnfinishedWorkoutReminderForSession(
  sessionId: string,
  lastLoggedSetAt = new Date().toISOString(),
): Promise<void> {
  try {
    if (!getUnfinishedWorkoutRemindersEnabled()) {
      await cancelUnfinishedWorkoutReminder();
      return;
    }

    const dueAt = getDueAt(lastLoggedSetAt);
    if (!dueAt) {
      await reconcileUnfinishedWorkoutReminder();
      return;
    }
    const existing = getUnfinishedWorkoutReminderState();
    if (existing?.sessionId === sessionId && existing.dueAt === dueAt) {
      return;
    }

    await scheduleReplacement({ dueAt, lastLoggedSetAt, sessionId });
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder scheduling failed', error);
  }
}

export async function reconcileUnfinishedWorkoutReminder(): Promise<void> {
  try {
    if (!getUnfinishedWorkoutRemindersEnabled()) {
      await cancelUnfinishedWorkoutReminder();
      return;
    }

    const row = getQualifyingWorkoutReminderRow();
    if (!row) {
      await cancelUnfinishedWorkoutReminder();
      return;
    }

    const dueAt = getDueAt(row.last_logged_set_at);
    if (!dueAt) {
      await cancelUnfinishedWorkoutReminder();
      return;
    }

    const existing = getUnfinishedWorkoutReminderState();
    if (existing?.sessionId === row.session_id && existing.dueAt === dueAt) {
      const scheduled = await hasScheduledNotification(existing.notificationId);
      if (scheduled === true || scheduled === null) {
        return;
      }
      setUnfinishedWorkoutReminderState(null);
      await scheduleReplacement({
        sessionId: row.session_id,
        lastLoggedSetAt: row.last_logged_set_at,
        dueAt,
      });
      return;
    }

    await scheduleReplacement({
      sessionId: row.session_id,
      lastLoggedSetAt: row.last_logged_set_at,
      dueAt,
    });
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder reconciliation failed', error);
  }
}

export async function cancelUnfinishedWorkoutReminder(): Promise<void> {
  try {
    const existing = getUnfinishedWorkoutReminderState();
    await cancelStoredNotification(existing);
    await cancelScheduledUnfinishedWorkoutNotifications({
      excludeNotificationId: existing?.notificationId ?? null,
    });
    setUnfinishedWorkoutReminderState(null);
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder cancellation failed', error);
  }
}

export function getUnfinishedWorkoutRemindersPreference(): boolean {
  return getUnfinishedWorkoutRemindersEnabled();
}

export async function setUnfinishedWorkoutRemindersPreference(enabled: boolean): Promise<void> {
  setUnfinishedWorkoutRemindersEnabled(enabled);
  if (enabled) {
    await reconcileUnfinishedWorkoutReminder();
    return;
  }
  await cancelUnfinishedWorkoutReminder();
}

function getReminderSessionIdFromData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { sessionId?: unknown; type?: unknown };
  if (payload.type !== UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE) return null;
  return typeof payload.sessionId === 'string' && payload.sessionId.trim()
    ? payload.sessionId
    : null;
}

function isSessionInProgress(sessionId: string): boolean {
  const row = query<{ id: string }>(
    `
    SELECT id
    FROM workout_session
    WHERE id = ?
      AND status = ?
      AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId, WORKOUT_SESSION_STATUS.IN_PROGRESS],
  )[0];
  return Boolean(row?.id);
}

export async function handleUnfinishedWorkoutReminderNotificationResponse(
  response: Notifications.NotificationResponse,
  navigation: ReminderNavigation,
): Promise<void> {
  const sessionId = getReminderSessionIdFromData(response.notification.request.content.data);
  if (!sessionId) return;

  try {
    if (isSessionInProgress(sessionId)) {
      navigation.navigate('WorkoutSession', { sessionId });
      return;
    }
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder tap handling failed', error);
  }

  navigation.navigate('MainTabs', { screen: 'Home' });
}

export function resetUnfinishedWorkoutReminderStateForTests(): void {
  channelSetupPromise = null;
}
