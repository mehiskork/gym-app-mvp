jest.mock('expo-haptics', () => ({
    notificationAsync: jest.fn(),
    NotificationFeedbackType: { Success: 'success' },
}));

import { notificationAsync } from 'expo-haptics';
import { maybeTriggerRestTimerHaptics } from '../restTimer';

describe('maybeTriggerRestTimerHaptics', () => {
    beforeEach(() => {
        (notificationAsync as jest.Mock).mockReset();
    });

    it('fires once when remaining hits zero', async () => {
        const ref = { current: false };

        await maybeTriggerRestTimerHaptics(0, true, ref);
        await maybeTriggerRestTimerHaptics(0, true, ref);

        expect(notificationAsync).toHaveBeenCalledTimes(1);
        expect(ref.current).toBe(true);
    });

    it('does not fire when vibration is disabled', async () => {
        const ref = { current: false };

        await maybeTriggerRestTimerHaptics(0, false, ref);

        expect(notificationAsync).not.toHaveBeenCalled();
    });
});