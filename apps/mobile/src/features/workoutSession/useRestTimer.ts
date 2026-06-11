import { useCallback, useEffect, useMemo, useRef } from 'react';
import type React from 'react';

import { clearRestTimer, type LoggerSession } from '../../db/workoutLoggerRepo';
import { getRemainingSeconds } from '../../utils/format';
import { maybeTriggerRestTimerHaptics } from '../../utils/restTimer';
import { cancelRestTimerNotification } from '../../utils/restTimerNotifications';

export function useRestTimer({
  session,
  sessionId,
  tick,
  vibrationEnabled,
  setSession,
}: {
  session: LoggerSession | null;
  sessionId: string;
  tick: number;
  vibrationEnabled: boolean;
  setSession: React.Dispatch<React.SetStateAction<LoggerSession | null>>;
}): {
  timerActive: boolean;
  remainingSeconds: number;
  clearRestTimerHandler: () => void;
} {
  const restHapticsRef = useRef(false);
  const previousRemainingSecondsRef = useRef<number | null>(null);

  const remainingSeconds = useMemo(
    () => getRemainingSeconds(session?.rest_timer_end_at ?? null),
    [session?.rest_timer_end_at, tick],
  );

  const timerActive = (session?.rest_timer_end_at ?? null) !== null;

  useEffect(() => {
    if (!timerActive) {
      restHapticsRef.current = false;
      previousRemainingSecondsRef.current = null;
      return;
    }

    const previousRemainingSeconds = previousRemainingSecondsRef.current;
    previousRemainingSecondsRef.current = remainingSeconds;

    if (remainingSeconds > 0) {
      void maybeTriggerRestTimerHaptics(remainingSeconds, vibrationEnabled, restHapticsRef);
      return;
    }

    if (previousRemainingSeconds !== null && previousRemainingSeconds > 0) {
      void maybeTriggerRestTimerHaptics(remainingSeconds, vibrationEnabled, restHapticsRef);
    }
  }, [remainingSeconds, vibrationEnabled, timerActive]);

  const clearRestTimerHandler = useCallback(() => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            rest_timer_end_at: null,
            rest_timer_label: null,
            rest_timer_seconds: null,
          }
        : prev,
    );

    clearRestTimer(sessionId);
    void cancelRestTimerNotification();
  }, [sessionId, setSession]);

  return {
    timerActive,
    remainingSeconds,
    clearRestTimerHandler,
  };
}
