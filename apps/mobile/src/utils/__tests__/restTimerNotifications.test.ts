jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

jest.mock(
    'expo-notifications',
    () => ({
        AndroidImportance: { DEFAULT: 'default' },
        setNotificationChannelAsync: jest.fn(),
        getPermissionsAsync: jest.fn(),
        requestPermissionsAsync: jest.fn(),
        scheduleNotificationAsync: jest.fn(),
        cancelScheduledNotificationAsync: jest.fn(),
    }),
    { virtual: true },
);

jest.mock('../../db/appMetaRepo', () => ({
    getRestTimerNotificationId: jest.fn().mockResolvedValue(null),
    setRestTimerNotificationId: jest.fn().mockResolvedValue(undefined),
}));

import * as Notifications from 'expo-notifications';
import {
    cancelRestTimerNotification,
    requestRestTimerNotificationPermission,
    resetRestTimerNotificationState,
    REST_TIMER_CHANNEL_ID,
    REST_TIMER_NOTIFICATION_VIBRATION_PATTERN,
    scheduleRestTimerNotification,
} from '../restTimerNotifications';

describe('restTimerNotifications', () => {
    beforeEach(() => {
        resetRestTimerNotificationState();
        (Notifications.getPermissionsAsync as jest.Mock).mockReset();
        (Notifications.requestPermissionsAsync as jest.Mock).mockReset();
        (Notifications.scheduleNotificationAsync as jest.Mock).mockReset();
        (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockReset();
        (Notifications.setNotificationChannelAsync as jest.Mock).mockReset();
        (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(null);
    });

    it('requests permission when enabling notifications', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

        const granted = await requestRestTimerNotificationPermission();

        expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(granted).toBe(true);
    });

    it('schedules a rest notification with the channel id and trigger seconds', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-1');

        await scheduleRestTimerNotification(75.4, true);

        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(REST_TIMER_CHANNEL_ID, {
            name: 'Rest timer',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: null,
            vibrationPattern: [...REST_TIMER_NOTIFICATION_VIBRATION_PATTERN],
            enableVibrate: true,
        });
        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
            content: {
                title: 'Rest complete',
                body: 'Time to lift.',
                channelId: REST_TIMER_CHANNEL_ID,
            },
            trigger: { seconds: 75, type: 'timeInterval' },
        });
    });

    it('disables vibration on channel when vibration setting is off', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-1');

        await scheduleRestTimerNotification(20, false);

        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(REST_TIMER_CHANNEL_ID, {
            name: 'Rest timer',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: null,
            vibrationPattern: null,
            enableVibrate: false,
        });
    });
    it('restarts by canceling the previous scheduled notification', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Notifications.scheduleNotificationAsync as jest.Mock)
            .mockResolvedValueOnce('notification-1')
            .mockResolvedValueOnce('notification-2');

        await scheduleRestTimerNotification(30, true);
        await scheduleRestTimerNotification(45, true);

        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    it('cancels the scheduled rest notification when cleared', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-1');

        await scheduleRestTimerNotification(10, true);
        await cancelRestTimerNotification();

        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    });
});