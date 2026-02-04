import * as Haptics from 'expo-haptics';

type TriggerRef = { current: boolean };

export async function maybeTriggerRestTimerHaptics(
    remainingSeconds: number,
    vibrationEnabled: boolean,
    hasTriggeredRef: TriggerRef,
) {
    if (remainingSeconds > 0) {
        hasTriggeredRef.current = false;
        return;
    }

    if (!vibrationEnabled || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}