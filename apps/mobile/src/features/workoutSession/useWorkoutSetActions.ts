import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import {
  addWorkoutSet,
  deleteWorkoutSet,
  restoreWorkoutSet,
  startRestTimer,
  updateWorkoutSet,
  type LoggerExercise,
  type LoggerSet,
} from '../../db/workoutLoggerRepo';
import type { Settings } from '../../db/settingsRepo';
import { isWorkoutLimitError } from '../../db/workoutLimits';
import { useSnackbarUndo } from '../../hooks/useSnackbarUndo';
import { scheduleRestTimerNotification } from '../../utils/restTimerNotifications';
import { parseRepsInput, parseWeightInput } from './setInputParsing';

type RestTimerSettings = Pick<
  Settings,
  'autoStartRestTimer' | 'defaultRestSeconds' | 'restTimerNotifications' | 'restTimerVibration'
>;

type UseWorkoutSetActionsArgs = {
  sessionId: string;
  restTimerSettings: RestTimerSettings;
  load: () => void;
};

export function useWorkoutSetActions({
  sessionId,
  restTimerSettings,
  load,
}: UseWorkoutSetActionsArgs) {
  const snackbarUndo = useSnackbarUndo<LoggerSet>({
    onUndo: (payload) => {
      restoreWorkoutSet(payload);
      load();
    },
  });

  const handleAddSet = useCallback(
    (exercise: LoggerExercise) => {
      try {
        addWorkoutSet(exercise.id);
      } catch (error) {
        if (isWorkoutLimitError(error)) return;
        throw error;
      }
      void Haptics.selectionAsync();
      load();
    },
    [load],
  );

  const handleWeightEndEditing = useCallback(
    (set: LoggerSet, value: string) => {
      const parsed = parseWeightInput(value);
      if (!parsed.ok) return false;

      updateWorkoutSet(set.id, { weight: parsed.value });
      load();
      return true;
    },
    [load],
  );

  const handleRepsEndEditing = useCallback(
    (set: LoggerSet, value: string) => {
      const parsed = parseRepsInput(value);
      if (!parsed.ok) return false;

      updateWorkoutSet(set.id, { reps: parsed.value });
      load();
      return true;
    },
    [load],
  );

  const handleToggleComplete = useCallback(
    (exercise: LoggerExercise, set: LoggerSet) => {
      const done = set.is_completed === 1;
      updateWorkoutSet(set.id, { is_completed: done ? 0 : 1 });
      void Haptics.selectionAsync();
      if (!done && restTimerSettings.autoStartRestTimer) {
        startRestTimer(sessionId, restTimerSettings.defaultRestSeconds, exercise.exercise_name);
        if (restTimerSettings.restTimerNotifications) {
          void scheduleRestTimerNotification(
            restTimerSettings.defaultRestSeconds,
            restTimerSettings.restTimerVibration,
          );
        }
      }
      load();
    },
    [load, restTimerSettings, sessionId],
  );

  const handleDeleteSet = useCallback(
    (set: LoggerSet) => {
      deleteWorkoutSet(set.id);
      snackbarUndo.showUndo(set);
      load();
    },
    [load, snackbarUndo],
  );

  return {
    snackbarUndo,
    handleAddSet,
    handleWeightEndEditing,
    handleRepsEndEditing,
    handleToggleComplete,
    handleDeleteSet,
  };
}
