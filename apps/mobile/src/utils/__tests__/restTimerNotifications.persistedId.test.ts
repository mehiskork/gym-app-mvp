jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

jest.mock(
    'expo-notifications',
    () => ({
        AndroidImportance: { DEFAULT: 'default' },
        setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
        getPermissionsAsync: jest.fn(),
        scheduleNotificationAsync: jest.fn(),
        cancelScheduledNotificationAsync: jest.fn(),
    }),
    { virtual: true },
);

jest.mock('../../db/appMetaRepo', () => ({
    getRestTimerNotificationId: jest.fn(),
    setRestTimerNotificationId: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import {
    getRestTimerNotificationId,
    setRestTimerNotificationId,
} from '../../db/appMetaRepo';
import {
    cancelRestTimerNotification,
    resetRestTimerNotificationState,
    scheduleRestTimerNotification,
} from '../restTimerNotifications';

describe('restTimerNotifications persisted id', () => {
    beforeEach(() => {
        resetRestTimerNotificationState();
        (Notifications.getPermissionsAsync as jest.Mock).mockReset();
        (Notifications.scheduleNotificationAsync as jest.Mock).mockReset();
        (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockReset();
        (getRestTimerNotificationId as jest.Mock).mockReset();
        (setRestTimerNotificationId as jest.Mock).mockReset();
        (setRestTimerNotificationId as jest.Mock).mockResolvedValue(undefined);
    });

    it('stores persisted id when scheduling', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('persisted-notification-id');
        (getRestTimerNotificationId as jest.Mock).mockResolvedValue(null);

        await scheduleRestTimerNotification(60);

        expect(setRestTimerNotificationId).toHaveBeenCalledWith('persisted-notification-id');
    });

    it('cancel uses persisted id even if in-memory state is empty', async () => {
        (getRestTimerNotificationId as jest.Mock).mockResolvedValue('persisted-only-id');

        await cancelRestTimerNotification();

        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('persisted-only-id');
    });

    it('cancel clears persisted id', async () => {
        (getRestTimerNotificationId as jest.Mock).mockResolvedValue('persisted-only-id');

        await cancelRestTimerNotification();

        expect(setRestTimerNotificationId).toHaveBeenCalledWith(null);
    });
});