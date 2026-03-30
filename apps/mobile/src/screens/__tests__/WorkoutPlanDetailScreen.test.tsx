jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useContext: jest.fn(() => ({
      primaryColorKey: 'blue',
      setPrimaryColorKey: jest.fn(),
      colors: new Proxy({}, { get: () => '#000000' }),
    })),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (styles: unknown) => styles,
    },
    Platform: { select: () => 'monospace' },
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

jest.mock('../../db/workoutPlanRepo', () => ({
  addDayToWorkoutPlan: jest.fn(),
  deleteWorkoutPlan: jest.fn(),
  getWorkoutPlanById: jest.fn(),
  listDaysForWorkoutPlan: jest.fn(),
  updateWorkoutPlanName: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  createSessionFromPlanDay: jest.fn(),
  getInProgressSession: jest.fn(),
  getLastCompletedAtByPlanDay: jest.fn(),
  getMostRecentCompletedDayIdForPlan: jest.fn(),
}));

import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { Button, EmptyState, Input, ListRow } from '../../ui';
import { WorkoutPlanDetailScreen } from '../WorkoutPlanDetailScreen';
import {
  createSessionFromPlanDay,
  getInProgressSession,
  getLastCompletedAtByPlanDay,
  getMostRecentCompletedDayIdForPlan,
} from '../../db/workoutSessionRepo';
import { updateWorkoutPlanName } from '../../db/workoutPlanRepo';

type Nav = {
  navigate: jest.Mock;
  goBack: jest.Mock;
  replace: jest.Mock;
};

const plan = { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 };

type Day = { id: string; name: string; day_index: number };

const findElementsByType = <P,>(
  node: React.ReactNode,
  type: React.ElementType,
  acc: Array<React.ReactElement<P>> = [],
): Array<React.ReactElement<P>> => {
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

describe('WorkoutPlanDetailScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);

    (createSessionFromPlanDay as jest.Mock).mockReset();
    (createSessionFromPlanDay as jest.Mock).mockReturnValue('session-55');
    (getInProgressSession as jest.Mock).mockReset();
    (getInProgressSession as jest.Mock).mockReturnValue(null);
    (getLastCompletedAtByPlanDay as jest.Mock).mockReset();
    (getLastCompletedAtByPlanDay as jest.Mock).mockReturnValue({});
    (getMostRecentCompletedDayIdForPlan as jest.Mock).mockReset();
    (getMostRecentCompletedDayIdForPlan as jest.Mock).mockReturnValue(null);
    (updateWorkoutPlanName as jest.Mock).mockReset();

    (useFocusEffect as jest.Mock).mockReset();
    (useFocusEffect as jest.Mock).mockImplementation((callback: () => void) => callback());
  });

  function renderScreen(input: {
    days: Day[];
    mode?: 'edit' | 'pickSessionToStart';
    planNameState?: string;
    lastCompletedByDayId?: Record<string, string>;
    navigation?: Nav;
  }) {
    const {
      days,
      mode = 'edit',
      planNameState = plan.name,
      lastCompletedByDayId = {},
      navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() },
    } = input;

    useStateMock.mockImplementationOnce(() => [plan, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [days, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [lastCompletedByDayId, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [planNameState, jest.fn()]);

    const element = WorkoutPlanDetailScreen({
      navigation,
      route: {
        key: 'WorkoutPlanDetail',
        name: 'WorkoutPlanDetail',
        params: mode === 'edit' ? { workoutPlanId: 'plan-1' } : { workoutPlanId: 'plan-1', mode },
      },
    } as never);

    return { element, navigation };
  }

  it('renders plan name input and session rows when sessions exist', () => {
    const { element } = renderScreen({ days: [{ id: 'day-1', name: 'Session 1', day_index: 1 }] });

    type InputProps = React.ComponentProps<typeof Input>;
    const inputs = findElementsByType<InputProps>(element, Input);
    expect(inputs[0]?.props.label).toBe('Plan name');

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    expect(rows[0]?.props.title).toBe('Session 1');
    expect(rows[0]?.props.subtitle).toBe('Tap to edit');
  });

  it('persists plan name edits from the inline input on blur', () => {
    const { element } = renderScreen({ days: [], planNameState: 'Renamed Plan' });

    type InputProps = React.ComponentProps<typeof Input>;
    const inputs = findElementsByType<InputProps>(element, Input);
    const planNameInput = inputs[0];
    if (!planNameInput?.props.onBlur) {
      throw new Error('Expected plan name Input onBlur.');
    }

    planNameInput.props.onBlur({} as never);
    expect(updateWorkoutPlanName).toHaveBeenCalledWith('plan-1', 'Renamed Plan');
  });

  it('navigates to day detail edit mode when session row is pressed in edit mode', () => {
    const { element, navigation } = renderScreen({
      days: [{ id: 'day-1', name: 'Session 1', day_index: 1 }],
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    rows[0]?.props.onPress?.({} as never);

    expect(navigation.navigate).toHaveBeenCalledWith('DayDetail', { dayId: 'day-1', mode: 'edit' });
  });

  it('shows session empty state when there are no sessions', () => {
    const { element } = renderScreen({ days: [] });

    type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
    const emptyStates = findElementsByType<EmptyStateProps>(element, EmptyState);
    expect(emptyStates[0]?.props.title).toBe('No sessions yet');
  });

  it('replaces to active workout on focus in pickSessionToStart mode', () => {
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-42' });

    const navigation: Nav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    renderScreen({ days: [], mode: 'pickSessionToStart', navigation });

    expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-42' });
  });

  it('starts a session and routes to WorkoutSession when row is pressed in picker mode', () => {
    const { element, navigation } = renderScreen({
      days: [{ id: 'day-1', name: 'Session 1', day_index: 1 }],
      mode: 'pickSessionToStart',
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    rows[0]?.props.onPress?.({} as never);

    expect(createSessionFromPlanDay).toHaveBeenCalledWith({
      workoutPlanId: 'plan-1',
      dayId: 'day-1',
    });
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-55' });
  });

  it('resumes in-progress session instead of creating a new one in picker mode', () => {
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-99' });

    const { element, navigation } = renderScreen({
      days: [{ id: 'day-1', name: 'Session 1', day_index: 1 }],
      mode: 'pickSessionToStart',
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    rows[0]?.props.onPress?.({} as never);

    expect(createSessionFromPlanDay).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-99' });
  });

  it('marks exactly one recommended session row based on latest completed day', () => {
    const days: Day[] = [
      { id: 'day-1', name: 'Push', day_index: 1 },
      { id: 'day-2', name: 'Pull', day_index: 2 },
      { id: 'day-3', name: 'Legs', day_index: 3 },
    ];
    (getMostRecentCompletedDayIdForPlan as jest.Mock).mockReturnValue('day-1');

    const { element } = renderScreen({
      days,
      mode: 'pickSessionToStart',
      lastCompletedByDayId: { 'day-1': '2026-01-02T10:00:00.000Z' },
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    const recommendedRows = rows.filter((row) => row.props.right !== undefined);

    expect(recommendedRows).toHaveLength(1);
    expect(rows[1]?.props.right).toBeDefined();
    expect(rows[0]?.props.right).toBeUndefined();
    expect(rows[2]?.props.right).toBeUndefined();
  });

  it('shows last-completed helper text for each row in picker mode', () => {
    const { element } = renderScreen({
      days: [
        { id: 'day-1', name: 'Push', day_index: 1 },
        { id: 'day-2', name: 'Pull', day_index: 2 },
      ],
      mode: 'pickSessionToStart',
      lastCompletedByDayId: { 'day-1': '2026-01-02T10:00:00.000Z' },
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);

    expect(rows[0]?.props.subtitle).toContain('Last completed');
    expect(rows[1]?.props.subtitle).toBe('Never completed');
  });

  it('ignores in-progress workouts from a different plan when computing recommendation', () => {
    (getMostRecentCompletedDayIdForPlan as jest.Mock).mockReturnValue('day-1');
    (getInProgressSession as jest.Mock).mockReturnValue({
      id: 'session-x',
      source_workout_plan_id: 'plan-other',
      source_program_day_id: 'day-2',
    });

    const { element } = renderScreen({
      days: [
        { id: 'day-1', name: 'Day 1', day_index: 1 },
        { id: 'day-2', name: 'Day 2', day_index: 2 },
      ],
      mode: 'pickSessionToStart',
    });

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    expect(rows[1]?.props.right).toBeDefined();
  });

  it('renders picker-mode start-only UI (read-only name, no edit controls, picker heading)', () => {
    const { element } = renderScreen({
      days: [{ id: 'day-1', name: 'Session 1', day_index: 1 }],
      mode: 'pickSessionToStart',
    });

    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    expect(buttons.some((button) => button.props.title === 'Add session')).toBe(false);
    expect(buttons.some((button) => button.props.title === 'Delete plan')).toBe(false);

    type InputProps = React.ComponentProps<typeof Input>;
    const inputs = findElementsByType<InputProps>(element, Input);
    expect(inputs[0]?.props.editable).toBe(false);
    expect(inputs[0]?.props.onBlur).toBeUndefined();

    type ListRowProps = React.ComponentProps<typeof ListRow>;
    const rows = findElementsByType<ListRowProps>(element, ListRow);
    expect(rows[0]?.props.subtitle).toBe('Never completed');

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Pick a session');
    expect(serialized).not.toContain('Start this day');
  });
});
