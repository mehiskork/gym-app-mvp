jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

import { impactAsync, notificationAsync } from 'expo-haptics';
import { maybeTriggerRestTimerHaptics } from '../restTimer';

describe('maybeTriggerRestTimerHaptics', () => {
  beforeEach(() => {
    (impactAsync as jest.Mock).mockReset();
    (notificationAsync as jest.Mock).mockReset();
  });

  it('fires once when remaining hits zero', async () => {
    const ref = { current: false };

    await maybeTriggerRestTimerHaptics(0, true, ref);
    await maybeTriggerRestTimerHaptics(0, true, ref);

    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(true);
  });

  it('does not fire when vibration is disabled', async () => {
    const ref = { current: false };

    await maybeTriggerRestTimerHaptics(0, false, ref);

    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});
