jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useEffect: jest.fn(),
    useRef: () => ({ current: null }),
  };
});

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: jest.fn((payload: unknown) => ({ type: 'RESET', payload })),
  },
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Keyboard: {
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      dismiss: jest.fn(),
    },
    KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('KeyboardAvoidingView', props, children),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    Modal: ({ children, visible, ...props }: { children?: React.ReactNode; visible?: boolean }) =>
      visible ? React.createElement('Modal', props, children) : null,
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('TextInput', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (styles: unknown) => styles,
    },
    Platform: { OS: 'ios', select: () => 'monospace' },
    Alert: { alert: jest.fn() },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SafeAreaView', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../db/workoutLoggerRepo', () => ({
  addWorkoutSet: jest.fn(),
  clearRestTimer: jest.fn(),
  deleteWorkoutSessionExercise: jest.fn(),
  deleteWorkoutSet: jest.fn(),
  restoreWorkoutSet: jest.fn(),
  getWorkoutLoggerData: jest.fn(),
  startRestTimer: jest.fn(),
  updateWorkoutSet: jest.fn(),
  updateWorkoutSessionExerciseComment: jest.fn(),
  updateWorkoutSessionExerciseCardioSummary: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  completeSession: jest.fn(),
  discardSession: jest.fn(),
  updateWorkoutSessionNote: jest.fn(),
}));

jest.mock('../../db/settingsRepo', () => ({
  getSettings: jest.fn(),
}));

jest.mock('../../utils/restTimerNotifications', () => ({
  cancelRestTimerNotification: jest.fn(),
  scheduleRestTimerNotification: jest.fn(),
}));

jest.mock('../../utils/restTimer', () => ({
  maybeTriggerRestTimerHaptics: jest.fn(),
}));

jest.mock('../../theme/theme', () => ({
  useAppTheme: () => ({ colors: { primary: '#000' } }),
}));

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CommonActions, useFocusEffect } from '@react-navigation/native';

import { WorkoutSessionScreen } from '../WorkoutSessionScreen';
import { TAB_ROUTES } from '../../navigation/routes';
import { CardioSummaryEditor } from '../../features/workoutSession/CardioSummaryEditor';
import { ExerciseCard } from '../../features/workoutSession/ExerciseCard';
import { SetRow } from '../../features/workoutSession/SetRow';
import {
  BottomSheetModal,
  Button,
  Card,
  DestructiveConfirmDialog,
  EmptyState,
  IconButton,
  Text,
} from '../../ui';
import {
  clearRestTimer,
  deleteWorkoutSessionExercise,
  getWorkoutLoggerData,
  updateWorkoutSessionExerciseCardioSummary,
  updateWorkoutSet,
} from '../../db/workoutLoggerRepo';
import { discardSession } from '../../db/workoutSessionRepo';
import { getSettings } from '../../db/settingsRepo';
import { tokens } from '../../theme/tokens';
import { cancelRestTimerNotification } from '../../utils/restTimerNotifications';
import { maybeTriggerRestTimerHaptics } from '../../utils/restTimer';

type Nav = {
  navigate: jest.Mock;
  dispatch: jest.Mock;
  setOptions: jest.Mock;
  addListener: jest.Mock;
};

const findElementsByType = <P,>(
  node: React.ReactNode,
  type: React.ElementType | string,
  acc: Array<React.ReactElement<P>> = [],
) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findElementsByType<P>(child, type, acc));
    return acc;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if (node.type === type) acc.push(node as React.ReactElement<P>);
    return findElementsByType<P>(node.props.children, type, acc);
  }
  return acc;
};

const getPositionStyle = (style?: StyleProp<ViewStyle>) => {
  if (!style) return undefined;
  return (StyleSheet.flatten(style) as ViewStyle | undefined)?.position;
};

const resolveStyle = (styleProp: unknown) => {
  if (typeof styleProp === 'function') {
    const resolved = styleProp({ pressed: false });
    if (Array.isArray(resolved)) {
      return resolved
        .filter(Boolean)
        .reduce<
          Record<string, unknown>
        >((acc, entry) => ({ ...acc, ...(entry as Record<string, unknown>) }), {});
    }
    return resolved;
  }
  return styleProp;
};

const createSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-remove',
  title: 'Push Day',
  status: 'in_progress',
  started_at: '2024-01-01T00:00:00Z',
  rest_timer_end_at: null,
  rest_timer_seconds: null,
  rest_timer_label: null,
  workout_note: null,
  ...overrides,
});

const createExercise = (overrides: Record<string, unknown> = {}) => ({
  id: 'exercise-remove',
  exercise_id: 'bench-press',
  exercise_name: 'Bench Press',
  exercise_type: 'strength',
  cardio_profile: null,
  position: 1,
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
  sets: [
    {
      id: 'set-remove',
      workout_session_exercise_id: 'exercise-remove',
      set_index: 1,
      weight: 100,
      reps: 5,
      rpe: null,
      rest_seconds: 90,
      notes: null,
      is_completed: 0,
    },
  ],
  ...overrides,
});

function mockScreenState(input: {
  session: Record<string, unknown>;
  exercises: Array<Record<string, unknown>>;
  deleteExerciseTarget?: Record<string, unknown> | null;
  isDeletingExercise?: boolean;
  finishOpen?: boolean;
}) {
  const setDeleteExerciseTarget = jest.fn();
  let callIndex = 0;
  const settings = {
    defaultRestSeconds: 120,
    autoStartRestTimer: true,
    restTimerVibration: true,
    keepScreenOn: true,
    restTimerNotifications: false,
  };

  (React.useState as jest.Mock).mockImplementation((initial: unknown) => {
    callIndex += 1;
    if (callIndex === 1) return [input.session, jest.fn()];
    if (callIndex === 2) return [input.exercises, jest.fn()];
    if (callIndex === 3) return [0, jest.fn()];
    if (callIndex === 4) return [settings, jest.fn()];
    if (callIndex === 5) return [input.finishOpen ?? false, jest.fn()];
    if (callIndex === 6) return [false, jest.fn()];
    if (callIndex === 7) return [0, jest.fn()];
    if (callIndex === 11) return [input.deleteExerciseTarget ?? null, setDeleteExerciseTarget];
    if (callIndex === 12) return [input.isDeletingExercise ?? false, jest.fn()];
    if (callIndex === 13) return [{ visible: false, payload: null }, jest.fn()];
    return [initial, jest.fn()];
  });

  return { setDeleteExerciseTarget };
}

describe('WorkoutSessionScreen', () => {
  const useStateMock = React.useState as jest.Mock;
  const useEffectMock = React.useEffect as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    useEffectMock.mockReset();
    (updateWorkoutSet as jest.Mock).mockReset();
    (deleteWorkoutSessionExercise as jest.Mock).mockReset();
    (deleteWorkoutSessionExercise as jest.Mock).mockReturnValue({ deleted: true });
    (discardSession as jest.Mock).mockReset();
    (updateWorkoutSessionExerciseCardioSummary as jest.Mock).mockReset();
    (clearRestTimer as jest.Mock).mockReset();
    (Keyboard.dismiss as jest.Mock).mockReset();
    (getWorkoutLoggerData as jest.Mock).mockReset();
    (cancelRestTimerNotification as jest.Mock).mockReset();
    (maybeTriggerRestTimerHaptics as jest.Mock).mockReset();
    (getSettings as jest.Mock).mockReturnValue({
      defaultRestSeconds: 120,
      autoStartRestTimer: true,
      restTimerVibration: true,
      keepScreenOn: true,
      restTimerNotifications: false,
    });
    (useFocusEffect as jest.Mock).mockImplementation((callback: () => void) => callback());
    (CommonActions.reset as jest.Mock).mockClear();
  });

  it('renders the exercise and toggles a set', () => {
    const session = {
      id: 'session-1',
      title: 'Push Day',
      status: 'in_progress',
      started_at: '2024-01-01T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'bench-press',
        exercise_name: 'Bench Press',
        position: 1,
        sets: [
          {
            id: 'set-1',
            workout_session_exercise_id: 'exercise-1',
            set_index: 1,
            weight: 100,
            reps: 5,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          },
          {
            id: 'set-2',
            workout_session_exercise_id: 'exercise-1',
            set_index: 2,
            weight: 100,
            reps: 5,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          },
        ],
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
    } as never);

    type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
    const exerciseCards = findElementsByType(element, ExerciseCard) as Array<
      React.ReactElement<ExerciseCardProps>
    >;
    expect(exerciseCards[0]?.props.name).toBe('Bench Press');

    type SetRowProps = React.ComponentProps<typeof SetRow>;
    const setRows = findElementsByType(element, SetRow) as Array<React.ReactElement<SetRowProps>>;
    expect(setRows).toHaveLength(2);
    expect(typeof setRows[0]?.props.onEditFocus).toBe('function');

    const scrollViews = findElementsByType(element, ScrollView) as Array<
      React.ReactElement<{ keyboardShouldPersistTaps?: string; onScroll?: unknown; ref?: unknown }>
    >;
    expect(scrollViews[0]?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(typeof scrollViews[0]?.props.onScroll).toBe('function');
    expect(
      scrollViews[0]?.props.ref ?? (scrollViews[0] as { ref?: unknown } | undefined)?.ref,
    ).toBeDefined();

    setRows[0]?.props.onToggleComplete();

    expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 1 });
    expect((Keyboard.dismiss as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (updateWorkoutSet as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('passes disabled Add Set state for an exercise with 50 sets', () => {
    const session = {
      id: 'session-1',
      title: 'Push Day',
      status: 'in_progress',
      started_at: '2024-01-01T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };
    const sets = Array.from({ length: 50 }, (_, index) => ({
      id: `set-${index + 1}`,
      workout_session_exercise_id: 'exercise-1',
      set_index: index + 1,
      weight: 100,
      reps: 5,
      rpe: null,
      rest_seconds: 90,
      notes: null,
      is_completed: 0,
    }));
    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'bench-press',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        cardio_profile: null,
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
        notes: null,
        position: 1,
        sets,
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const element = WorkoutSessionScreen({
      navigation: {
        navigate: jest.fn(),
        dispatch: jest.fn(),
        setOptions: jest.fn(),
        addListener: jest.fn(),
      },
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
    } as never);

    type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
    const exerciseCards = findElementsByType(element, ExerciseCard) as Array<
      React.ReactElement<ExerciseCardProps>
    >;

    expect(exerciseCards[0]?.props.addSetDisabled).toBe(true);
  });

  it('disables Add exercise and blocks picker navigation at 50 active exercises', () => {
    const session = {
      id: 'session-1',
      title: 'Push Day',
      status: 'in_progress',
      started_at: '2024-01-01T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };
    const exercises = Array.from({ length: 50 }, (_, index) => ({
      id: `exercise-${index + 1}`,
      exercise_id: `exercise-template-${index + 1}`,
      exercise_name: `Exercise ${index + 1}`,
      exercise_type: 'strength',
      cardio_profile: null,
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
      notes: null,
      position: index + 1,
      sets: [],
    }));

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    const addExerciseButton = buttons.find((button) => button.props.title === 'Max 50 exercises');

    expect(addExerciseButton?.props.disabled).toBe(true);
    addExerciseButton?.props.onPress?.({} as never);
    expect(navigation.navigate).not.toHaveBeenCalledWith('ExercisePicker', {
      addToSessionId: 'session-1',
    });
  });

  it('passes keyboard-safe focus handling to cardio inputs', () => {
    const session = {
      id: 'session-1',
      title: 'Cardio Day',
      status: 'in_progress',
      started_at: '2024-01-01T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'bike',
        exercise_name: 'Bike',
        exercise_type: 'cardio',
        cardio_profile: 'bike',
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
        sets: [],
        notes: null,
        position: 1,
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
    } as never);

    type CardioSummaryEditorProps = React.ComponentProps<typeof CardioSummaryEditor>;
    const editors = findElementsByType(element, CardioSummaryEditor) as Array<
      React.ReactElement<CardioSummaryEditorProps>
    >;
    expect(editors).toHaveLength(1);
    expect(typeof editors[0]?.props.onEditFocus).toBe('function');
  });

  const renderCardioSession = () => {
    const session = {
      id: 'session-1',
      title: 'Cardio Day',
      status: 'in_progress',
      started_at: '2024-01-01T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };
    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'erg',
        exercise_name: 'Erg',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
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
        sets: [],
        notes: null,
        position: 1,
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const element = WorkoutSessionScreen({
      navigation: {
        navigate: jest.fn(),
        dispatch: jest.fn(),
        setOptions: jest.fn(),
        addListener: jest.fn(),
      },
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
    } as never);

    type CardioSummaryEditorProps = React.ComponentProps<typeof CardioSummaryEditor>;
    return (
      findElementsByType(element, CardioSummaryEditor) as Array<
        React.ReactElement<CardioSummaryEditorProps>
      >
    )[0];
  };

  it('valid cardio edit updates summary then reloads', () => {
    const editor = renderCardioSession();
    (getWorkoutLoggerData as jest.Mock).mockClear();

    const accepted = editor?.props.onFieldEndEditing('distance_km', '4,5');

    expect(accepted).toBe(true);
    expect(updateWorkoutSessionExerciseCardioSummary).toHaveBeenCalledWith('exercise-1', {
      distance_km: 4.5,
    });
    expect(getWorkoutLoggerData).toHaveBeenCalledWith('session-1');
  });

  it('invalid cardio edit does not update summary or reload', () => {
    const editor = renderCardioSession();
    (getWorkoutLoggerData as jest.Mock).mockClear();

    const accepted = editor?.props.onFieldEndEditing('distance_km', '4.55');

    expect(accepted).toBe(false);
    expect(updateWorkoutSessionExerciseCardioSummary).not.toHaveBeenCalled();
    expect(getWorkoutLoggerData).not.toHaveBeenCalled();
  });

  it('empty cardio edit saves null', () => {
    const editor = renderCardioSession();

    const accepted = editor?.props.onFieldEndEditing('distance_km', '   ');

    expect(accepted).toBe(true);
    expect(updateWorkoutSessionExerciseCardioSummary).toHaveBeenCalledWith('exercise-1', {
      distance_km: null,
    });
  });

  it('valid pace cardio edit saves seconds', () => {
    const editor = renderCardioSession();

    const accepted = editor?.props.onFieldEndEditing('pace_seconds_per_km', '6:05');

    expect(accepted).toBe(true);
    expect(updateWorkoutSessionExerciseCardioSummary).toHaveBeenCalledWith('exercise-1', {
      pace_seconds_per_km: 365,
    });
  });

  it('renders swap on every exercise card and targets the tapped exercise', () => {
    const session = {
      id: 'session-6',
      title: 'Full Body',
      status: 'in_progress',
      started_at: '2024-01-06T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'bench-press',
        exercise_name: 'Bench Press',
        position: 1,
        sets: [
          {
            id: 'set-1',
            workout_session_exercise_id: 'exercise-1',
            set_index: 1,
            weight: 100,
            reps: 5,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 1,
          },
        ],
      },
      {
        id: 'exercise-2',
        exercise_id: 'dumbbell-row',
        exercise_name: 'Dumbbell Row',
        position: 2,
        sets: [
          {
            id: 'set-2',
            workout_session_exercise_id: 'exercise-2',
            set_index: 1,
            weight: null,
            reps: null,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          },
        ],
      },
      {
        id: 'exercise-3',
        exercise_id: 'squat',
        exercise_name: 'Squat',
        position: 3,
        sets: [
          {
            id: 'set-3',
            workout_session_exercise_id: 'exercise-3',
            set_index: 1,
            weight: null,
            reps: null,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          },
        ],
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-6' } },
    } as never);

    type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
    const exerciseCards = findElementsByType(element, ExerciseCard) as Array<
      React.ReactElement<ExerciseCardProps>
    >;

    expect(exerciseCards).toHaveLength(3);
    exerciseCards.forEach((card) => {
      expect(card.props.onSwap).toEqual(expect.any(Function));
    });

    exerciseCards[1]?.props.onSwap?.();

    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', {
      swapSessionExerciseId: 'exercise-2',
      swapSessionId: 'session-6',
    });
  });

  it('opens remove confirmation from the exercise card with exact copy', () => {
    const session = createSession();
    const exercise = createExercise();
    const { setDeleteExerciseTarget } = mockScreenState({
      session,
      exercises: [exercise],
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [exercise] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
    const exerciseCards = findElementsByType(element, ExerciseCard) as Array<
      React.ReactElement<ExerciseCardProps>
    >;
    exerciseCards[0]?.props.onRemove?.();

    expect(setDeleteExerciseTarget).toHaveBeenCalledWith(exercise);

    mockScreenState({
      session,
      exercises: [exercise],
      deleteExerciseTarget: exercise,
    });
    const confirmElement = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);
    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(confirmElement, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;

    expect(dialogs[0]?.props.visible).toBe(true);
    expect(dialogs[0]?.props.title).toBe('Remove exercise?');
    expect(dialogs[0]?.props.body).toBe(
      'This will remove this exercise, its sets, notes, and cardio details from this workout.',
    );
    expect(dialogs[0]?.props.cancelLabel).toBe('Cancel');
    expect(dialogs[0]?.props.confirmLabel).toBe('Remove');
  });

  it('cancels remove confirmation without deleting', () => {
    const session = createSession();
    const exercise = createExercise();
    const { setDeleteExerciseTarget } = mockScreenState({
      session,
      exercises: [exercise],
      deleteExerciseTarget: exercise,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [exercise] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(element, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;
    dialogs[0]?.props.onClose();

    expect(setDeleteExerciseTarget).toHaveBeenCalledWith(null);
    expect(deleteWorkoutSessionExercise).not.toHaveBeenCalled();
  });

  it('removes the selected exercise, reloads, and blocks duplicate stale confirms', () => {
    const session = createSession();
    const exercise = createExercise();
    mockScreenState({
      session,
      exercises: [exercise],
      deleteExerciseTarget: exercise,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(element, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;
    dialogs[0]?.props.onConfirm();
    dialogs[0]?.props.onConfirm();

    expect(deleteWorkoutSessionExercise).toHaveBeenCalledTimes(1);
    expect(deleteWorkoutSessionExercise).toHaveBeenCalledWith('session-remove', 'exercise-remove');
    expect(getWorkoutLoggerData).toHaveBeenCalledWith('session-remove');
  });

  it('leaves the active workout open with empty state after removing the only exercise', () => {
    const session = createSession();
    mockScreenState({
      session,
      exercises: [],
      finishOpen: true,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
    const emptyStates = findElementsByType(element, EmptyState) as Array<
      React.ReactElement<EmptyStateProps>
    >;

    expect(emptyStates[0]?.props.title).toBe('No exercises yet');
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('uses the existing no-work finish flow after the only exercise was removed', () => {
    const session = createSession();
    mockScreenState({
      session,
      exercises: [],
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType(element, Button) as Array<React.ReactElement<ButtonProps>>;
    const finishButton = buttons.find((button) => button.props.title === 'Finish workout');
    finishButton?.props.onPress?.({} as never);

    mockScreenState({
      session,
      exercises: [],
    });
    const openFinishElement = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);
    type BottomSheetProps = React.ComponentProps<typeof BottomSheetModal>;
    const sheets = findElementsByType(openFinishElement, BottomSheetModal) as Array<
      React.ReactElement<BottomSheetProps>
    >;
    const openButtons = findElementsByType(sheets[0]?.props.actions, Button) as Array<
      React.ReactElement<ButtonProps>
    >;
    const endWithoutSavingButton = openButtons.find(
      (button) => button.props.title === 'End without saving',
    );

    endWithoutSavingButton?.props.onPress?.({} as never);
    expect(discardSession).toHaveBeenCalledWith('session-remove');
  });

  it('re-enables Add exercise after deleting below the 50 exercise limit', () => {
    const session = createSession();
    const exercises = Array.from({ length: 49 }, (_, index) =>
      createExercise({
        id: `exercise-${index + 1}`,
        exercise_id: `exercise-base-${index + 1}`,
        exercise_name: `Exercise ${index + 1}`,
        position: index + 1,
        sets: [],
      }),
    );
    mockScreenState({
      session,
      exercises,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType(element, Button) as Array<React.ReactElement<ButtonProps>>;
    const addExerciseButton = buttons.find((button) => button.props.title === 'Add exercise');

    expect(addExerciseButton?.props.disabled).toBe(false);
    addExerciseButton?.props.onPress?.({} as never);
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', {
      addToSessionId: 'session-remove',
    });
  });

  it('clears only an unambiguous matching rest timer after exercise removal', () => {
    const session = createSession({
      rest_timer_end_at: '2024-01-01T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Bench Press',
    });
    const exercise = createExercise();
    mockScreenState({
      session,
      exercises: [exercise],
      deleteExerciseTarget: exercise,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(element, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;
    dialogs[0]?.props.onConfirm();

    expect(clearRestTimer).toHaveBeenCalledWith('session-remove');
    expect(cancelRestTimerNotification).toHaveBeenCalledTimes(1);
  });

  it('leaves a non-matching rest timer alone after exercise removal', () => {
    const session = createSession({
      rest_timer_end_at: '2024-01-01T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Squat',
    });
    const exercise = createExercise();
    mockScreenState({
      session,
      exercises: [exercise],
      deleteExerciseTarget: exercise,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(element, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;
    dialogs[0]?.props.onConfirm();

    expect(clearRestTimer).not.toHaveBeenCalled();
    expect(cancelRestTimerNotification).not.toHaveBeenCalled();
  });

  it('leaves an ambiguous duplicate-name rest timer alone after exercise removal', () => {
    const session = createSession({
      rest_timer_end_at: '2024-01-01T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Bench Press',
    });
    const exercise = createExercise();
    const duplicate = createExercise({
      id: 'exercise-duplicate',
      exercise_id: 'bench-press-duplicate',
      position: 2,
      sets: [],
    });
    mockScreenState({
      session,
      exercises: [exercise, duplicate],
      deleteExerciseTarget: exercise,
    });
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises: [duplicate] });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: {
        key: 'WorkoutSession',
        name: 'WorkoutSession',
        params: { sessionId: 'session-remove' },
      },
    } as never);

    type ConfirmProps = React.ComponentProps<typeof DestructiveConfirmDialog>;
    const dialogs = findElementsByType(element, DestructiveConfirmDialog) as Array<
      React.ReactElement<ConfirmProps>
    >;
    dialogs[0]?.props.onConfirm();

    expect(clearRestTimer).not.toHaveBeenCalled();
    expect(cancelRestTimerNotification).not.toHaveBeenCalled();
  });

  it('renders inline empty-state add exercise and footer add exercise next to finish workout', () => {
    const session = {
      id: 'session-2',
      title: 'Leg Day',
      status: 'in_progress',
      started_at: '2024-01-02T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises: Array<unknown> = [];

    const setFinishOpen = jest.fn();
    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, setFinishOpen]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-2' } },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType(element, Button) as Array<React.ReactElement<ButtonProps>>;
    const footerAddExerciseButton = buttons.find((button) => button.props.title === 'Add exercise');
    const finishButton = buttons.find((button) => button.props.title === 'Finish workout');
    type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
    const emptyStates = findElementsByType(element, EmptyState) as Array<
      React.ReactElement<EmptyStateProps>
    >;
    const inlineButtons = findElementsByType(emptyStates[0]?.props.action, Button) as Array<
      React.ReactElement<ButtonProps>
    >;
    const inlineAddExerciseButton = inlineButtons.find(
      (button) => button.props.title === 'Add exercise',
    );
    const views = findElementsByType(element, View) as Array<
      React.ReactElement<{ style?: StyleProp<ViewStyle> }>
    >;
    const footerView = views.find((view) => {
      const style = StyleSheet.flatten(view.props.style) as ViewStyle | undefined;
      return style?.position === 'absolute' && style?.borderTopWidth === 1;
    });

    expect(emptyStates[0]?.props.title).toBe('No exercises yet');
    expect(emptyStates[0]?.props.description).toBe('Add exercises to start logging your sets.');
    expect(inlineAddExerciseButton?.props.variant).toBe('secondary');
    expect(footerAddExerciseButton?.props.variant).toBe('secondary');
    expect(footerView).toBeDefined();
    expect(
      (StyleSheet.flatten(footerView?.props.style) as ViewStyle | undefined)?.flexDirection,
    ).toBe('row');
    inlineAddExerciseButton?.props.onPress?.({} as never);
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', {
      addToSessionId: 'session-2',
    });
    navigation.navigate.mockClear();
    footerAddExerciseButton?.props.onPress?.({} as never);
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', {
      addToSessionId: 'session-2',
    });

    expect(finishButton?.props.variant).toBe('primary');
    finishButton?.props.onPress?.({} as never);

    expect(setFinishOpen).toHaveBeenCalledWith(true);
  });

  it('does not render the inline empty-state action when exercises exist', () => {
    const session = {
      id: 'session-7',
      title: 'Push Day',
      status: 'in_progress',
      started_at: '2024-01-07T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises = [
      {
        id: 'exercise-1',
        exercise_id: 'bench-press',
        exercise_name: 'Bench Press',
        position: 1,
        sets: [],
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-7' } },
    } as never);

    type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
    const emptyStates = findElementsByType(element, EmptyState) as Array<
      React.ReactElement<EmptyStateProps>
    >;
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType(element, Button) as Array<React.ReactElement<ButtonProps>>;
    const addExerciseButtons = buttons.filter((button) => button.props.title === 'Add exercise');

    expect(emptyStates).toHaveLength(0);
    expect(addExerciseButtons).toHaveLength(1);
    addExerciseButtons[0]?.props.onPress?.({} as never);
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', {
      addToSessionId: 'session-7',
    });
  });

  it('does not render the overall sets counter in the header', () => {
    const session = {
      id: 'session-3',
      title: 'Pull Day',
      status: 'in_progress',
      started_at: '2024-01-03T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises: Array<unknown> = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-3' } },
    } as never);

    type TextProps = React.ComponentProps<typeof Text>;
    const texts = findElementsByType(element, Text) as Array<React.ReactElement<TextProps>>;
    const setsLabel = texts.find((text) => text.props.children === 'Sets');

    expect(setsLabel).toBeUndefined();
  });

  it('renders the rest timer overlay outside the scroll view when active', () => {
    const session = {
      id: 'session-4',
      title: 'Conditioning',
      status: 'in_progress',
      started_at: '2024-01-04T00:00:00Z',
      rest_timer_end_at: '2024-01-04T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Row',
    };

    const exercises: Array<unknown> = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-4' } },
    } as never);

    type CardProps = React.ComponentProps<typeof Card>;
    const allCards = findElementsByType(element, Card) as Array<React.ReactElement<CardProps>>;
    const overlayCard = allCards.find((card) => getPositionStyle(card.props.style) === 'absolute');

    expect(overlayCard).toBeDefined();
    expect((StyleSheet.flatten(overlayCard?.props.style) as ViewStyle | undefined)?.top).toBe(
      tokens.spacing.xs,
    );

    const scrollViews = findElementsByType(element, ScrollView) as Array<
      React.ReactElement<{
        children?: React.ReactNode;
        contentContainerStyle?: StyleProp<ViewStyle>;
        onScroll?: unknown;
      }>
    >;
    const workoutScrollView = scrollViews.find((scrollView) => scrollView.props.onScroll);
    expect(
      (StyleSheet.flatten(workoutScrollView?.props.contentContainerStyle) as ViewStyle | undefined)
        ?.paddingTop,
    ).toBe(tokens.spacing.xs + tokens.touchTargetMin + tokens.spacing.xl + tokens.spacing.sm);
    const scrollCards = scrollViews.flatMap(
      (scrollView) =>
        findElementsByType(scrollView.props.children, Card) as Array<React.ReactElement<CardProps>>,
    );

    const scrollOverlayCard = scrollCards.find(
      (card) => getPositionStyle(card.props.style) === 'absolute',
    );
    expect(scrollOverlayCard).toBeUndefined();

    const iconButtons = findElementsByType(element, IconButton) as Array<
      React.ReactElement<{ accessibilityLabel?: string; variant?: string }>
    >;
    const clearRestTimerButton = iconButtons.find(
      (button) => button.props.accessibilityLabel === 'Clear rest timer',
    );
    expect(clearRestTimerButton?.props.variant).toBe('danger');
  });

  it('clears the rest timer optimistically and preserves unrelated session fields', () => {
    const session = {
      id: 'session-4',
      title: 'Conditioning',
      status: 'in_progress',
      started_at: '2024-01-04T00:00:00Z',
      rest_timer_end_at: '2024-01-04T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Row',
      workout_note: 'Keep elbows high',
    };

    const exercises: Array<unknown> = [];
    const setSession = jest.fn();

    useStateMock.mockImplementationOnce(() => [session, setSession]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: true,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    const element = WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-4' } },
    } as never);

    const iconButtons = findElementsByType(element, IconButton) as Array<
      React.ReactElement<{ accessibilityLabel?: string; onPress?: () => void }>
    >;
    const clearRestTimerButton = iconButtons.find(
      (button) => button.props.accessibilityLabel === 'Clear rest timer',
    );

    clearRestTimerButton?.props.onPress?.();

    expect(setSession).toHaveBeenCalledWith(expect.any(Function));
    const optimisticUpdater = setSession.mock.calls.find(
      ([value]) => typeof value === 'function',
    )?.[0];
    const optimisticSession = optimisticUpdater(session);
    expect(optimisticSession).toEqual({
      ...session,
      rest_timer_end_at: null,
      rest_timer_label: null,
      rest_timer_seconds: null,
    });
    expect(optimisticSession.title).toBe(session.title);
    expect(optimisticSession.status).toBe(session.status);
    expect(optimisticSession.started_at).toBe(session.started_at);
    expect(optimisticSession.workout_note).toBe(session.workout_note);
    expect(clearRestTimer).toHaveBeenCalledWith('session-4');
    expect(cancelRestTimerNotification).toHaveBeenCalledTimes(1);
  });

  it('passes completed rest timer state to haptics when vibration is enabled', () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2024-01-04T00:01:00Z').getTime());
    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanup();
    });
    const session = {
      id: 'session-4',
      title: 'Conditioning',
      status: 'in_progress',
      started_at: '2024-01-04T00:00:00Z',
      rest_timer_end_at: '2024-01-04T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Row',
    };

    const exercises: Array<unknown> = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-4' } },
    } as never);

    expect(maybeTriggerRestTimerHaptics).toHaveBeenCalledWith(0, true, expect.any(Object));
    nowSpy.mockRestore();
  });

  it('passes vibration disabled to haptics when the setting is off', () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2024-01-04T00:01:00Z').getTime());
    useEffectMock.mockImplementation((callback: () => void | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === 'function') cleanup();
    });
    const session = {
      id: 'session-4',
      title: 'Conditioning',
      status: 'in_progress',
      started_at: '2024-01-04T00:00:00Z',
      rest_timer_end_at: '2024-01-04T00:01:00Z',
      rest_timer_seconds: 60,
      rest_timer_label: 'Row',
    };

    const exercises: Array<unknown> = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: false,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(),
    };
    WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-4' } },
    } as never);

    expect(maybeTriggerRestTimerHaptics).toHaveBeenCalledWith(0, false, expect.any(Object));
    nowSpy.mockRestore();
  });

  it('redirects back navigation to the Home tab', () => {
    const session = {
      id: 'session-5',
      title: 'Core Day',
      status: 'in_progress',
      started_at: '2024-01-05T00:00:00Z',
      rest_timer_end_at: null,
      rest_timer_seconds: null,
      rest_timer_label: null,
    };

    const exercises: Array<unknown> = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

    let beforeRemoveHandler:
      | ((event: { data: { action: { type: string } }; preventDefault: () => void }) => void)
      | undefined;
    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn((event: string, handler: typeof beforeRemoveHandler) => {
        if (event === 'beforeRemove') {
          beforeRemoveHandler = handler ?? undefined;
        }
        return jest.fn();
      }),
    };

    WorkoutSessionScreen({
      navigation,
      route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-5' } },
    } as never);

    expect(navigation.addListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));

    const preventDefault = jest.fn();
    beforeRemoveHandler?.({ data: { action: { type: 'GO_BACK' } }, preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      },
    });
  });

  it('silently resets to Home when session detail is missing', () => {
    const { Alert } = require('react-native');
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        defaultRestSeconds: 120,
        autoStartRestTimer: true,
        restTimerVibration: true,
        keepScreenOn: true,
        restTimerNotifications: false,
      },
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
    (getWorkoutLoggerData as jest.Mock).mockReturnValue(null);

    const navigation: Nav = {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };

    expect(() =>
      WorkoutSessionScreen({
        navigation,
        route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'missing' } },
      } as never),
    ).not.toThrow();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      },
    });
  });

  it('styles completed set rows and destructive icons', () => {
    useStateMock.mockImplementation(() => [0, jest.fn()]);

    const element = SetRow({
      set: {
        id: 'set-9',
        workout_session_exercise_id: 'exercise-1',
        set_index: 1,
        weight: 100,
        reps: 5,
        rpe: null,
        rest_seconds: 90,
        notes: null,
        is_completed: 1,
      },
      onWeightEndEditing: jest.fn(),
      onRepsEndEditing: jest.fn(),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const views = findElementsByType(element, View) as Array<
      React.ReactElement<{ style?: StyleProp<ViewStyle> }>
    >;
    const rowStyle = StyleSheet.flatten(views[0]?.props.style) as ViewStyle | undefined;
    expect(rowStyle?.backgroundColor).toBe(tokens.colors.successSurface);
    expect(rowStyle?.borderColor).toBe(tokens.colors.success);

    const pressables = findElementsByType(element, Pressable) as Array<
      React.ReactElement<{ style?: unknown }>
    >;
    const checkStyle = StyleSheet.flatten(resolveStyle(pressables[0]?.props.style)) as
      | ViewStyle
      | undefined;
    expect(checkStyle?.backgroundColor).toBe(tokens.colors.success);
    expect(checkStyle?.borderColor).toBe(tokens.colors.success);

    const texts = findElementsByType(element, Text) as Array<
      React.ReactElement<{ children?: React.ReactNode }>
    >;
    expect(texts[0]?.props.children).toBe(1);
    expect(texts.some((text) => text.props.children === 'kg')).toBe(false);
    expect(texts.some((text) => text.props.children === 'reps')).toBe(false);
    expect(texts.some((text) => text.props.children === 'Set 1')).toBe(false);

    const iconButtons = findElementsByType(element, IconButton) as Array<
      React.ReactElement<{ accessibilityLabel?: string; variant?: string }>
    >;
    const deleteSetButton = iconButtons.find(
      (button) => button.props.accessibilityLabel === 'Delete set',
    );
    expect(deleteSetButton?.props.variant).toBe('danger');
  });

  it('renders the add set row inside the exercise card and triggers onAddSet', () => {
    const onAddSet = jest.fn();
    const element = ExerciseCard({
      name: 'Squat',
      subtitle: '0/1 sets complete',
      onAddSet,
      children: <Text>Set row</Text>,
    });

    const pressables = findElementsByType(element, Pressable) as Array<
      React.ReactElement<{ onPress?: () => void; style?: unknown; testID?: string }>
    >;
    const addSetRow = pressables.find(
      (pressable) => pressable.props.testID === 'exercise-card-add-set',
    );
    const addSetStyle = StyleSheet.flatten(resolveStyle(addSetRow?.props.style)) as
      | ViewStyle
      | undefined;

    expect(addSetRow).toBeDefined();
    expect(addSetStyle?.borderStyle).toBeUndefined();
    expect(addSetStyle?.borderWidth).toBe(1);
    expect(addSetStyle?.flex).toBe(1);
    addSetRow?.props.onPress?.();
    expect(onAddSet).toHaveBeenCalled();
  });
  it('renders set, weight, and reps column headers once per exercise card', () => {
    const element = ExerciseCard({
      name: 'Deadlift',
      subtitle: '0/2 sets complete',
      onAddSet: jest.fn(),
      children: [
        <SetRow
          key="set-1"
          set={{
            id: 'set-1',
            workout_session_exercise_id: 'exercise-1',
            set_index: 1,
            weight: 120,
            reps: 5,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          }}
          onWeightEndEditing={jest.fn()}
          onRepsEndEditing={jest.fn()}
          onToggleComplete={jest.fn()}
          onDelete={jest.fn()}
        />,
        <SetRow
          key="set-2"
          set={{
            id: 'set-2',
            workout_session_exercise_id: 'exercise-1',
            set_index: 2,
            weight: 120,
            reps: 5,
            rpe: null,
            rest_seconds: 90,
            notes: null,
            is_completed: 0,
          }}
          onWeightEndEditing={jest.fn()}
          onRepsEndEditing={jest.fn()}
          onToggleComplete={jest.fn()}
          onDelete={jest.fn()}
        />,
      ],
    });

    const texts = findElementsByType(element, Text) as Array<
      React.ReactElement<{ children?: React.ReactNode }>
    >;
    const setLabels = texts.filter((text) => text.props.children === 'SET');
    const weightLabels = texts.filter((text) => text.props.children === 'WEIGHT');
    const repLabels = texts.filter((text) => text.props.children === 'REPS');

    expect(setLabels).toHaveLength(1);
    expect(weightLabels).toHaveLength(1);
    expect(repLabels).toHaveLength(1);
  });
  it('shows Add Note label when no exercise note exists', () => {
    const element = ExerciseCard({
      name: 'Deadlift',
      subtitle: null,
      onAddSet: jest.fn(),
      onCommentPress: jest.fn(),
      commentButtonLabel: 'Add Note',
      children: [],
    });
    const texts = findElementsByType(element, Text) as Array<
      React.ReactElement<{ children?: React.ReactNode }>
    >;
    expect(texts.some((text) => text.props.children === 'Add Note')).toBe(true);
  });

  it('shows View Note label when exercise note exists', () => {
    const element = ExerciseCard({
      name: 'Deadlift',
      subtitle: null,
      onAddSet: jest.fn(),
      onCommentPress: jest.fn(),
      commentButtonLabel: 'View Note',
      children: [],
    });
    const texts = findElementsByType(element, Text) as Array<
      React.ReactElement<{ children?: React.ReactNode }>
    >;
    expect(texts.some((text) => text.props.children === 'View Note')).toBe(true);
  });
});
