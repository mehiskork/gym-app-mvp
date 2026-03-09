import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
    getRestTimerNotificationId,
    setRestTimerNotificationId,
} from '../db/appMetaRepo';

export const REST_TIMER_CHANNEL_ID = 'rest-timer';
export const REST_TIMER_CHANNEL_ID_V2 = 'rest-timer-v2';
export const REST_TIMER_SILENT_CHANNEL_ID_V2 = 'rest-timer-silent-v2';
export const REST_TIMER_NOTIFICATION_VIBRATION_PATTERN = [0, 350, 120, 300, 120, 350] as const;

let restTimerNotificationId: string | null = null;
let channelSetupPromiseByMode: Record<'vibrate' | 'silent', Promise<void> | null> = {
    vibrate: null,
    silent: null,
};

function getRestTimerChannelId(vibrationEnabled: boolean): string {
    return vibrationEnabled ? REST_TIMER_CHANNEL_ID_V2 : REST_TIMER_SILENT_CHANNEL_ID_V2;
}

export async function ensureRestTimerNotificationChannel(vibrationEnabled: boolean): Promise<void> {
    if (Platform.OS !== 'android') return;

    const modeKey = vibrationEnabled ? 'vibrate' : 'silent';
    const existingSetup = channelSetupPromiseByMode[modeKey];
    if (existingSetup) {
        await existingSetup;
        return;
    }

    channelSetupPromiseByMode[modeKey] = Notifications.setNotificationChannelAsync(getRestTimerChannelId(vibrationEnabled), {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
        vibrationPattern: vibrationEnabled ? [...REST_TIMER_NOTIFICATION_VIBRATION_PATTERN] : null,
        enableVibrate: vibrationEnabled,
    }).then(() => undefined);

    await channelSetupPromiseByMode[modeKey];
}

export async function requestRestTimerNotificationPermission(): Promise<boolean> {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
}

export async function scheduleRestTimerNotification(
    remainingSeconds: number,
    vibrationEnabled = true,
): Promise<void> {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') return;
    await ensureRestTimerNotificationChannel(vibrationEnabled);
    await cancelRestTimerNotification();
    const seconds = Math.max(0, Math.floor(remainingSeconds));
    const trigger = {
        seconds,
        type: 'timeInterval',
    } as Notifications.NotificationTriggerInput;
    const content = {
        title: 'Rest complete',
        body: 'Time to lift.',
        channelId: getRestTimerChannelId(vibrationEnabled),
    } as Notifications.NotificationContentInput;
    const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger,
    });
    restTimerNotificationId = id;
    await setRestTimerNotificationId(id);
}

export async function cancelRestTimerNotification(): Promise<void> {
    const id = restTimerNotificationId ?? (await getRestTimerNotificationId());
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
    restTimerNotificationId = null;
    await setRestTimerNotificationId(null);
}

export function resetRestTimerNotificationState(): void {
    restTimerNotificationId = null;
    channelSetupPromiseByMode = {
        vibrate: null,
        silent: null,
    };
}