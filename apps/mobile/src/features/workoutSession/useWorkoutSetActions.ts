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

type RestTimerSettings = Pick<
  Settings,
  'autoStartRestTimer' | 'defaultRestSeconds' | 'restTimerNotifications' | 'restTimerVibration'
>;

type UseWorkoutSetActionsArgs = {
  sessionId: string;
  restTimerSettings: RestTimerSettings;
  load: () => void;
};

function parseSetNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

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
      updateWorkoutSet(set.id, { weight: parseSetNumber(value) });
      load();
    },
    [load],
  );

  const handleRepsEndEditing = useCallback(
    (set: LoggerSet, value: string) => {
      const n = parseSetNumber(value);
      updateWorkoutSet(set.id, {
        reps: n === null ? null : Math.max(0, Math.floor(n)),
      });
      load();
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
