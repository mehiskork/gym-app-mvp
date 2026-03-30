import * as Haptics from 'expo-haptics';

type TriggerRef = { current: boolean };

const REST_TIMER_HAPTIC_GAP_MS = 90;

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
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  await new Promise((resolve) => setTimeout(resolve, REST_TIMER_HAPTIC_GAP_MS));
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
