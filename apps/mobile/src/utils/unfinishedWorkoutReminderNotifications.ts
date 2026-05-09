import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { query } from '../db/db';
import { WORKOUT_SESSION_STATUS } from '../db/constants';
import {
  getUnfinishedWorkoutReminderState,
  setUnfinishedWorkoutReminderState,
} from '../db/appMetaRepo';
import type { UnfinishedWorkoutReminderState } from '../db/appMetaRepo';
import { logEvent } from './logger';
import { parseTimestampMs } from './timestamp';

export const UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID = 'unfinished-workout-reminders-v1';
export const UNFINISHED_WORKOUT_REMINDER_DELAY_MS = 60 * 60 * 1000;

let channelSetupPromise: Promise<void> | null = null;

type QualifyingWorkoutReminderRow = {
  session_id: string;
  last_logged_set_at: string;
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

async function cancelStoredNotification(state: UnfinishedWorkoutReminderState | null) {
  if (!state?.notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(state.notificationId);
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder OS cancellation failed', error);
  }
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
  const permissions = await Notifications.getPermissionsAsync();
  const existing = getUnfinishedWorkoutReminderState();

  if (permissions.status !== 'granted') {
    await cancelStoredNotification(existing);
    setUnfinishedWorkoutReminderState(null);
    return;
  }

  await ensureUnfinishedWorkoutReminderChannel();
  await cancelStoredNotification(existing);
  setUnfinishedWorkoutReminderState(null);

  const content = {
    title: 'Finish your workout?',
    body: "You have logged sets in TrainFrame but haven't finished this workout yet.",
    channelId: UNFINISHED_WORKOUT_REMINDER_CHANNEL_ID,
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
    setUnfinishedWorkoutReminderState(null);
  } catch (error) {
    logNotificationWarning('Unfinished workout reminder cancellation failed', error);
  }
}

export function resetUnfinishedWorkoutReminderStateForTests(): void {
  channelSetupPromise = null;
}
