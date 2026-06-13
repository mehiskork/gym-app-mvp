jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useRef: jest.fn((initial: unknown) => ({ current: initial })),
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback: () => void) => callback()),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SafeAreaView', props, children),
  };
});

jest.mock('../../ui', () => {
  const React = require('react');
  return {
    BottomSheetModal: ({
      children,
      visible,
      ...props
    }: {
      children?: React.ReactNode;
      visible?: boolean;
    }) => (visible ? React.createElement('BottomSheetModal', props, children) : null),
    Button: (props: { children?: React.ReactNode }) =>
      React.createElement('Button', props, props.children),
    Input: (props: { children?: React.ReactNode }) =>
      React.createElement('Input', props, props.children),
    ListRow: (props: { children?: React.ReactNode; right?: React.ReactNode }) =>
      React.createElement('ListRow', props, props.children, props.right),
    Snackbar: (props: { children?: React.ReactNode }) =>
      React.createElement('Snackbar', props, props.children),
  };
});

jest.mock('../../db/historyRepo', () => ({
  getSessionDetail: jest.fn(),
}));

jest.mock('../../db/workoutPlanRepo', () => ({
  listWorkoutPlansWithSessionCounts: jest.fn(() => []),
  saveCompletedWorkoutAsPlan: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  startCompletedWorkoutAsQuickWorkout: jest.fn(),
}));

jest.mock('../../db/prRepo', () => ({
  listSessionPrEvents: jest.fn(() => []),
  recomputeSessionPrsIfNeeded: jest.fn(),
}));

import React from 'react';
import { getSessionDetail } from '../../db/historyRepo';
import {
  listWorkoutPlansWithSessionCounts,
  saveCompletedWorkoutAsPlan,
} from '../../db/workoutPlanRepo';
import { startCompletedWorkoutAsQuickWorkout } from '../../db/workoutSessionRepo';
import { SessionDetailScreen } from '../SessionDetailScreen';
import type { SessionSetRow } from '../../db/historyRepo';
import { BottomSheetModal, Button } from '../../ui';

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
    Object.values(node.props ?? {}).forEach((value) => {
      if (
        value &&
        (React.isValidElement(value) ||
          Array.isArray(value) ||
          typeof value === 'string' ||
          typeof value === 'number')
      ) {
        findElementsByType<P>(value, type, acc);
      }
    });
    return acc;
  }
  return acc;
};

describe('SessionDetailScreen notes', () => {
  const useStateMock = React.useState as jest.Mock;

  const flushReuseStart = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReset();
    (listWorkoutPlansWithSessionCounts as jest.Mock).mockReset();
    (listWorkoutPlansWithSessionCounts as jest.Mock).mockReturnValue([]);
    (saveCompletedWorkoutAsPlan as jest.Mock).mockReset();
    (saveCompletedWorkoutAsPlan as jest.Mock).mockResolvedValue({
      workoutPlanId: 'plan-1',
      programDayId: 'day-1',
      createdPlan: true,
    });
    (startCompletedWorkoutAsQuickWorkout as jest.Mock).mockReset();
    (startCompletedWorkoutAsQuickWorkout as jest.Mock).mockReturnValue('new-session-1');
  });

  it('shows workout and plan exercise notes in history details', () => {
    const session = {
      id: 's-1',
      title: 'Push Day',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: '2026-01-01T01:00:00Z',
      workout_note: 'Solid pace',
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        position: 1,
        notes: 'Controlled tempo',
        plan_note_snapshot: 'Use a pause on each rep',
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-1' } },
    } as never);

    expect(JSON.stringify(element)).toContain('Plan Note: ');
    expect(JSON.stringify(element)).toContain('Use a pause on each rep');
    expect(JSON.stringify(element)).toContain('Workout Note: ');
    expect(JSON.stringify(element)).toContain('Controlled tempo');
    expect(JSON.stringify(element)).toContain('Workout Note: ');
    expect(JSON.stringify(element)).toContain('Solid pace');
  });

  it('marks incomplete history sets as incomplete instead of edit', () => {
    const session = {
      id: 's-2',
      title: 'Pull Session',
      started_at: '2026-01-02T00:00:00Z',
      ended_at: '2026-01-02T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'row',
        exercise_name: 'Row',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    const sets: SessionSetRow[] = [
      {
        id: 'set-1',
        workout_session_exercise_id: 'wse-1',
        set_index: 1,
        weight: 80,
        reps: 8,
        is_completed: 0,
      } as SessionSetRow,
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-2' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain(' (incomplete)');
    expect(serialized).not.toContain(' (edit)');
  });

  it('formats cardio pace as min:sec per km in history details', () => {
    const session = {
      id: 's-3',
      title: 'Erg Session',
      started_at: '2026-01-03T00:00:00Z',
      ended_at: '2026-01-03T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'erg',
        exercise_name: 'Erg',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
        position: 1,
        notes: null,
        cardio_duration_minutes: null,
        cardio_distance_km: null,
        cardio_speed_kph: null,
        cardio_incline_percent: null,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: 355,
        cardio_floors: null,
        cardio_stair_level: null,
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-3' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Pace 5:55 /km');
    expect(serialized).not.toContain('355s/km');
  });

  it('shows saved rowing distance in history details', () => {
    const session = {
      id: 's-rowing',
      title: 'Rowing Session',
      started_at: '2026-01-03T00:00:00Z',
      ended_at: '2026-01-03T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-rowing',
        exercise_id: 'rowing',
        exercise_name: 'Rowing Machine',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
        position: 1,
        notes: null,
        cardio_duration_minutes: 11,
        cardio_distance_km: 11,
        cardio_speed_kph: null,
        cardio_incline_percent: null,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: 355,
        cardio_floors: null,
        cardio_stair_level: null,
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-rowing' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Distance 11 km');
    expect(serialized).toContain('Pace 5:55 /km');
  });

  it('shows saved treadmill incline in history details', () => {
    const session = {
      id: 's-treadmill',
      title: 'Treadmill Session',
      started_at: '2026-01-03T00:00:00Z',
      ended_at: '2026-01-03T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-treadmill',
        exercise_id: 'treadmill',
        exercise_name: 'Treadmill',
        exercise_type: 'cardio',
        cardio_profile: 'treadmill',
        position: 1,
        notes: null,
        cardio_duration_minutes: 11,
        cardio_distance_km: 11,
        cardio_speed_kph: 11,
        cardio_incline_percent: 11,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: null,
        cardio_floors: null,
        cardio_stair_level: null,
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-treadmill' } },
    } as never);

    expect(JSON.stringify(element)).toContain('Incline 11%');
  });

  it('does not render pace when cardio pace is null', () => {
    const session = {
      id: 's-4',
      title: 'Erg Session',
      started_at: '2026-01-04T00:00:00Z',
      ended_at: '2026-01-04T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'erg',
        exercise_name: 'Erg',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
        position: 1,
        notes: null,
        cardio_duration_minutes: 20,
        cardio_distance_km: null,
        cardio_speed_kph: null,
        cardio_incline_percent: null,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: null,
        cardio_floors: null,
        cardio_stair_level: null,
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-4' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Duration 20 min');
    expect(serialized).not.toContain('Pace ');
    expect(serialized).not.toContain('s/km');
  });

  it('shows compact reuse action for eligible quick workouts and removes the old card copy', () => {
    const session = {
      id: 's-5',
      source_workout_plan_id: null,
      source_program_day_id: null,
      title: 'Quick Workout',
      started_at: '2026-01-05T00:00:00Z',
      ended_at: '2026-01-05T01:00:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: {
        key: 'SessionDetail',
        name: 'SessionDetail',
        params: { sessionId: 's-5', postFinish: true },
      },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Reuse workout');
    expect(serialized).not.toContain('Reuse this workout');
    expect(serialized).not.toContain(
      'Save exercises, sets, reps, weights, and cardio targets so you can use this workout again.',
    );
  });

  it('guards save-as-plan against two immediate presses before re-render', async () => {
    const session = {
      id: 's-7',
      title: 'Quick Workout',
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T10:45:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };
    let resolveSave: (value: unknown) => void = () => undefined;
    (saveCompletedWorkoutAsPlan as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
    const element = SessionDetailScreen({
      navigation,
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-7' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const createButton = buttons.find((button) => button.props.title === 'Create new plan');

    createButton?.props.onPress?.({} as never);
    createButton?.props.onPress?.({} as never);

    expect(saveCompletedWorkoutAsPlan).toHaveBeenCalledTimes(1);
    resolveSave({ workoutPlanId: 'plan-1', programDayId: 'day-1', createdPlan: true });
    await Promise.resolve();
  });

  it('resets the save-as-plan guard after an error', async () => {
    const session = {
      id: 's-7',
      title: 'Quick Workout',
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T10:45:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };
    (saveCompletedWorkoutAsPlan as jest.Mock)
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({ workoutPlanId: 'plan-1', programDayId: 'day-1', createdPlan: true });

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
    const element = SessionDetailScreen({
      navigation,
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-7' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const createButton = buttons.find((button) => button.props.title === 'Create new plan');

    createButton?.props.onPress?.({} as never);
    await Promise.resolve();
    createButton?.props.onPress?.({} as never);

    expect(saveCompletedWorkoutAsPlan).toHaveBeenCalledTimes(2);
  });

  it('shows reuse action for eligible planned workouts', () => {
    const session = {
      id: 's-6',
      source_workout_plan_id: 'plan-1',
      source_program_day_id: 'day-1',
      title: 'Push',
      started_at: '2026-01-06T00:00:00Z',
      ended_at: '2026-01-06T01:00:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-6' } },
    } as never);

    expect(JSON.stringify(element)).toContain('Reuse workout');
  });

  it('hides reuse action for non-reusable completed workouts', () => {
    const session = {
      id: 's-empty',
      source_workout_plan_id: null,
      source_program_day_id: null,
      title: 'Empty',
      started_at: '2026-01-06T00:00:00Z',
      ended_at: '2026-01-06T01:00:00Z',
      workout_note: null,
      can_reuse_as_plan: 0,
    };

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-empty' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    expect(buttons.some((button) => button.props.title === 'Reuse workout')).toBe(false);
  });

  it('save sheet can call new-plan and existing-plan saves while full plans are disabled', async () => {
    const navigation = { setOptions: jest.fn(), navigate: jest.fn() };
    const session = {
      id: 's-7',
      source_workout_plan_id: null,
      source_program_day_id: null,
      title: 'Quick Workout',
      started_at: '2026-01-07T00:00:00Z',
      ended_at: '2026-01-07T01:00:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };
    const plans = [
      {
        id: 'plan-open',
        name: 'Open Plan',
        description: null,
        is_template: 0,
        sessionCount: 2,
      },
      {
        id: 'plan-full',
        name: 'Full Plan',
        description: null,
        is_template: 0,
        sessionCount: 15,
      },
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation,
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-7' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const startButton = buttons.find((button) => button.props.title === 'Start as Quick Workout');
    const createButton = buttons.find((button) => button.props.title === 'Create new plan');
    const addButton = buttons.find((button) => button.props.title === 'Add');
    const fullButton = buttons.find((button) => button.props.title === 'Plan is full');

    expect(startButton).toBeTruthy();

    await createButton?.props.onPress?.({} as never);
    expect(saveCompletedWorkoutAsPlan).toHaveBeenCalledWith({
      sessionId: 's-7',
      target: { kind: 'newPlan', name: 'Quick Workout Plan' },
    });

    await addButton?.props.onPress?.({} as never);
    expect(saveCompletedWorkoutAsPlan).toHaveBeenCalledWith({
      sessionId: 's-7',
      target: { kind: 'existingPlan', workoutPlanId: 'plan-open' },
    });
    expect(fullButton?.props.disabled).toBe(true);
    expect(JSON.stringify(element)).toContain('Plan is full');
    expect(JSON.stringify(element)).toContain('Add to existing plan');
  });

  it('guards start-as-quick against two immediate presses before re-render', async () => {
    const session = {
      id: 's-start',
      title: 'Quick Workout',
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T10:45:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation: { navigate: jest.fn(), setOptions: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-start' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const startButton = buttons.find((button) => button.props.title === 'Start as Quick Workout');

    startButton?.props.onPress?.({} as never);
    startButton?.props.onPress?.({} as never);

    expect(startCompletedWorkoutAsQuickWorkout).not.toHaveBeenCalled();
    await flushReuseStart();
    expect(startCompletedWorkoutAsQuickWorkout).toHaveBeenCalledTimes(1);
  });

  it('starts a reused workout as a quick active session and resets the reuse guard', async () => {
    const session = {
      id: 's-start-nav',
      title: 'Quick Workout',
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T10:45:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };
    const setReuseOpen = jest.fn();
    const setIsReusing = jest.fn();

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, setReuseOpen]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, setIsReusing]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
    const element = SessionDetailScreen({
      navigation,
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-start-nav' } },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const startButton = buttons.find((button) => button.props.title === 'Start as Quick Workout');

    startButton?.props.onPress?.({} as never);

    expect(setIsReusing).toHaveBeenCalledWith(true);
    await flushReuseStart();
    expect(startCompletedWorkoutAsQuickWorkout).toHaveBeenCalledWith('s-start-nav');
    expect(setReuseOpen).toHaveBeenCalledWith(false);
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutSession', {
      sessionId: 'new-session-1',
    });
    expect(setIsReusing).toHaveBeenLastCalledWith(false);
  });

  it('returns to the mounted source detail with reuse sheet actions usable and closable', async () => {
    const session = {
      id: 's-start-return',
      title: 'Quick Workout',
      started_at: '2026-01-01T10:00:00Z',
      ended_at: '2026-01-01T10:45:00Z',
      workout_note: null,
      can_reuse_as_plan: 1,
    };
    const setReuseOpenAfterReturn = jest.fn();

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [true, setReuseOpenAfterReturn]);
    useStateMock.mockImplementationOnce(() => ['Quick Workout Plan', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises: [], sets: [] });

    const element = SessionDetailScreen({
      navigation: { navigate: jest.fn(), setOptions: jest.fn() },
      route: {
        key: 'SessionDetail',
        name: 'SessionDetail',
        params: { sessionId: 's-start-return' },
      },
    } as never);

    const buttons = findElementsByType(element, Button) as Array<
      React.ReactElement<React.ComponentProps<typeof Button>>
    >;
    const startButton = buttons.find((button) => button.props.title === 'Start as Quick Workout');
    const createButton = buttons.find((button) => button.props.title === 'Create new plan');
    const sheet = findElementsByType<{
      onClose?: () => void;
    }>(element, BottomSheetModal)[0];

    expect(startButton?.props.loading).toBe(false);
    expect(startButton?.props.disabled).toBe(false);
    expect(createButton?.props.loading).toBe(false);
    expect(createButton?.props.disabled).toBe(false);

    sheet?.props.onClose?.();
    expect(setReuseOpenAfterReturn).toHaveBeenCalledWith(false);
  });
});
