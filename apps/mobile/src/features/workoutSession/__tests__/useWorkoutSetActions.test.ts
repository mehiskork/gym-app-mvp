const mockState = { visible: false, payload: null as unknown };
const mockSetState = jest.fn((next: unknown) => {
  mockState.visible = Boolean((next as { visible?: boolean }).visible);
  mockState.payload = (next as { payload?: unknown }).payload ?? null;
});

jest.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: jest.fn(),
  useRef: jest.fn(() => ({ current: null })),
  useState: jest.fn(() => [mockState, mockSetState]),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('../../../db/workoutLoggerRepo', () => ({
  addWorkoutSet: jest.fn(),
  deleteWorkoutSet: jest.fn(),
  restoreWorkoutSet: jest.fn(),
  startRestTimer: jest.fn(),
  updateWorkoutSet: jest.fn(),
}));

jest.mock('../../../utils/restTimerNotifications', () => ({
  scheduleRestTimerNotification: jest.fn(),
}));

import * as Haptics from 'expo-haptics';

import {
  addWorkoutSet,
  deleteWorkoutSet,
  restoreWorkoutSet,
  startRestTimer,
  updateWorkoutSet,
  type LoggerExercise,
  type LoggerSet,
} from '../../../db/workoutLoggerRepo';
import { scheduleRestTimerNotification } from '../../../utils/restTimerNotifications';
import { WorkoutLimitError, WORKOUT_LIMIT_MESSAGES } from '../../../db/workoutLimits';
import { useWorkoutSetActions } from '../useWorkoutSetActions';

const baseRestTimerSettings = {
  autoStartRestTimer: true,
  defaultRestSeconds: 150,
  restTimerNotifications: true,
  restTimerVibration: false,
};

function createSet(overrides?: Partial<LoggerSet>): LoggerSet {
  return {
    id: 'set-1',
    workout_session_exercise_id: 'exercise-1',
    set_index: 1,
    weight: 100,
    reps: 5,
    rpe: null,
    rest_seconds: 90,
    notes: null,
    is_completed: 0,
    ...overrides,
  };
}

function createExercise(overrides?: Partial<LoggerExercise>): LoggerExercise {
  return {
    id: 'exercise-1',
    exercise_id: 'bench-press',
    exercise_name: 'Bench Press',
    exercise_type: 'strength',
    cardio_profile: null,
    position: 1,
    sets: [createSet()],
    notes: null,
    cardio_summary: {
      duration_minutes: null,
      distance_km: null,
      speed_kph: null,
      incline_percent: null,
      resistance_level: null,
      pace_seconds_per_km: null,
      floors: null,
      stair_level: null,
    },
    ...overrides,
  };
}

function setup(overrides?: Partial<Parameters<typeof useWorkoutSetActions>[0]>) {
  const load = jest.fn();
  const result = useWorkoutSetActions({
    sessionId: 'session-1',
    restTimerSettings: baseRestTimerSettings,
    load,
    ...overrides,
  });

  return { ...result, load };
}

describe('useWorkoutSetActions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockState.visible = false;
    mockState.payload = null;
    mockSetState.mockClear();
    (addWorkoutSet as jest.Mock).mockReset();
    (deleteWorkoutSet as jest.Mock).mockReset();
    (restoreWorkoutSet as jest.Mock).mockReset();
    (startRestTimer as jest.Mock).mockReset();
    (updateWorkoutSet as jest.Mock).mockReset();
    (scheduleRestTimerNotification as jest.Mock).mockReset();
    (Haptics.selectionAsync as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('adds a set, triggers haptics, then reloads', () => {
    const { handleAddSet, load } = setup();
    const exercise = createExercise();

    handleAddSet(exercise);

    expect(addWorkoutSet).toHaveBeenCalledWith('exercise-1');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect((addWorkoutSet as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (Haptics.selectionAsync as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((Haptics.selectionAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      load.mock.invocationCallOrder[0],
    );
  });

  it('handles set limit errors without success haptics or reload', () => {
    const { handleAddSet, load } = setup();
    (addWorkoutSet as jest.Mock).mockImplementationOnce(() => {
      throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxSetsPerExercise);
    });

    expect(() => handleAddSet(createExercise())).not.toThrow();

    expect(addWorkoutSet).toHaveBeenCalledWith('exercise-1');
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('parses empty set weight to null and reloads', () => {
    const { handleWeightEndEditing, load } = setup();

    handleWeightEndEditing(createSet(), '   ');

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { weight: null });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('parses comma decimal set weight and reloads', () => {
    const { handleWeightEndEditing, load } = setup();

    handleWeightEndEditing(createSet(), '82,5');

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { weight: 82.5 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('parses empty set reps to null and reloads', () => {
    const { handleRepsEndEditing, load } = setup();

    handleRepsEndEditing(createSet(), '');

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { reps: null });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('floors decimal set reps and reloads', () => {
    const { handleRepsEndEditing, load } = setup();

    handleRepsEndEditing(createSet(), '8.9');

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { reps: 8 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clamps negative set reps to zero and reloads', () => {
    const { handleRepsEndEditing, load } = setup();

    handleRepsEndEditing(createSet(), '-3');

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { reps: 0 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('completes a set, starts rest timer, schedules notification, then reloads in order', () => {
    const { handleToggleComplete, load } = setup();

    handleToggleComplete(createExercise(), createSet({ is_completed: 0 }));

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 1 });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(startRestTimer).toHaveBeenCalledWith('session-1', 150, 'Bench Press');
    expect(scheduleRestTimerNotification).toHaveBeenCalledWith(150, false);
    expect(load).toHaveBeenCalledTimes(1);
    expect((updateWorkoutSet as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (Haptics.selectionAsync as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((Haptics.selectionAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (startRestTimer as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((startRestTimer as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (scheduleRestTimerNotification as jest.Mock).mock.invocationCallOrder[0],
    );
    expect((scheduleRestTimerNotification as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      load.mock.invocationCallOrder[0],
    );
  });

  it('un-completes a set without starting rest timer or scheduling notification', () => {
    const { handleToggleComplete, load } = setup();

    handleToggleComplete(createExercise(), createSet({ is_completed: 1 }));

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 0 });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(startRestTimer).not.toHaveBeenCalled();
    expect(scheduleRestTimerNotification).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not start rest timer when auto-start is disabled', () => {
    const { handleToggleComplete, load } = setup({
      restTimerSettings: {
        ...baseRestTimerSettings,
        autoStartRestTimer: false,
      },
    });

    handleToggleComplete(createExercise(), createSet({ is_completed: 0 }));

    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 1 });
    expect(startRestTimer).not.toHaveBeenCalled();
    expect(scheduleRestTimerNotification).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not schedule notification when rest timer notifications are disabled', () => {
    const { handleToggleComplete, load } = setup({
      restTimerSettings: {
        ...baseRestTimerSettings,
        restTimerNotifications: false,
      },
    });

    handleToggleComplete(createExercise(), createSet({ is_completed: 0 }));

    expect(startRestTimer).toHaveBeenCalledWith('session-1', 150, 'Bench Press');
    expect(scheduleRestTimerNotification).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('deletes a set, exposes visible undo state, and reloads', () => {
    const { handleDeleteSet, load } = setup();
    const set = createSet();

    handleDeleteSet(set);
    const afterDelete = useWorkoutSetActions({
      sessionId: 'session-1',
      restTimerSettings: baseRestTimerSettings,
      load,
    });

    expect(deleteWorkoutSet).toHaveBeenCalledWith('set-1');
    expect(mockSetState).toHaveBeenCalledWith({ visible: true, payload: set });
    expect(afterDelete.snackbarUndo.visible).toBe(true);
    expect(afterDelete.snackbarUndo.payload).toBe(set);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('undo restores the deleted set and reloads', () => {
    const set = createSet();
    mockState.visible = true;
    mockState.payload = set;
    const { snackbarUndo, load } = setup();

    snackbarUndo.onUndoAction();

    expect(restoreWorkoutSet).toHaveBeenCalledWith(set);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
