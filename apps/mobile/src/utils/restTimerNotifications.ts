import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
    getRestTimerNotificationId,
    setRestTimerNotificationId,
} from '../db/appMetaRepo';


export const REST_TIMER_CHANNEL_ID = 'rest-timer';

let restTimerNotificationId: string | null = null;
let channelSetupPromise: Promise<void> | null = null;

export async function ensureRestTimerNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;
    if (!channelSetupPromise) {
        channelSetupPromise = Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL_ID, {
            name: 'Rest timer',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: null,
            vibrationPattern: null,
            enableVibrate: false,
        }).then(() => undefined);
    }
    await channelSetupPromise;
}

export async function requestRestTimerNotificationPermission(): Promise<boolean> {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
}

export async function scheduleRestTimerNotification(remainingSeconds: number): Promise<void> {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') return;
    await ensureRestTimerNotificationChannel();
    await cancelRestTimerNotification();
    const seconds = Math.max(0, Math.floor(remainingSeconds));
    const trigger = {
        seconds,
        type: 'timeInterval',
    } as Notifications.NotificationTriggerInput;
    const content = {
        title: 'Rest complete',
        body: 'Time to lift.',
        channelId: REST_TIMER_CHANNEL_ID,
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
    channelSetupPromise = null;
}