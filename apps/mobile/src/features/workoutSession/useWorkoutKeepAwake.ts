import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { WORKOUT_SESSION_STATUS, type WorkoutSessionStatus } from '../../db/constants';

const KEEP_AWAKE_TAG = 'workout-session';

export function useWorkoutKeepAwake({
  isFocused,
  keepScreenOn,
  sessionStatus,
}: {
  isFocused: boolean;
  keepScreenOn: boolean;
  sessionStatus: WorkoutSessionStatus | undefined;
}) {
  useEffect(() => {
    if (isFocused && keepScreenOn && sessionStatus === WORKOUT_SESSION_STATUS.IN_PROGRESS) {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
    return undefined;
  }, [isFocused, keepScreenOn, sessionStatus]);
}
