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
  useFocusEffect: jest.fn((callback: () => void) => callback()),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('DraggableFlatList', props, children),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
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

jest.mock('../../db/dayExerciseRepo', () => ({
  addPlannedSetToDayExercise: jest.fn(),
  deleteDayExercise: jest.fn(),
  deletePlannedSet: jest.fn(),
  getDayById: jest.fn(),
  listDayExercises: jest.fn(),
  listPlannedSetsForDayExercise: jest.fn(),
  renameDay: jest.fn(),
  reorderDayExercises: jest.fn(),
  updatePlannedSetTargets: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  createSessionFromPlanDay: jest.fn(),
  getInProgressSession: jest.fn(),
  getSessionById: jest.fn(),
}));

import React from 'react';
import { Pressable } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, ListRow, Screen } from '../../ui';
import { DayDetailScreen } from '../DayDetailScreen';
import {
  createSessionFromPlanDay,
  getInProgressSession,
  getSessionById,
} from '../../db/workoutSessionRepo';
import {
  addPlannedSetToDayExercise,
  deletePlannedSet,
  listPlannedSetsForDayExercise,
  reorderDayExercises,
  updatePlannedSetTargets,
} from '../../db/dayExerciseRepo';
import { tokens } from '../../theme/tokens';

type Nav = {
  navigate: jest.Mock;
  replace: jest.Mock;
  setOptions: jest.Mock;
};

const findElementsByType = <P,>(
  node: React.ReactNode,
  type: React.ElementType,
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

const findElementsByProp = <P extends Record<string, unknown>>(
  node: React.ReactNode,
  propName: string,
  acc: Array<React.ReactElement<P>> = [],
) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findElementsByProp<P>(child, propName, acc));
    return acc;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if (Object.prototype.hasOwnProperty.call(node.props, propName)) {
      acc.push(node as React.ReactElement<P>);
    }
    return findElementsByProp<P>(node.props.children, propName, acc);
  }
  return acc;
};

describe('DayDetailScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    (createSessionFromPlanDay as jest.Mock).mockReset();
    (getInProgressSession as jest.Mock).mockReset();
    (getInProgressSession as jest.Mock).mockReturnValue(null);
    (getSessionById as jest.Mock).mockReset();
    (getSessionById as jest.Mock).mockReturnValue({ id: 'session-1' });
    (addPlannedSetToDayExercise as jest.Mock).mockReset();
    (deletePlannedSet as jest.Mock).mockReset();
    (listPlannedSetsForDayExercise as jest.Mock).mockReset();
    (listPlannedSetsForDayExercise as jest.Mock).mockReturnValue([]);
    (updatePlannedSetTargets as jest.Mock).mockReset();
  });

  it('shows empty state and add exercise action when no exercises exist', () => {
    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const emptyStates = findElementsByType<React.ComponentProps<typeof EmptyState>>(
      element,
      EmptyState,
    );
    expect(emptyStates[0]?.props.title).toBe('No exercises yet');

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(element, Button);
    const addExerciseButton = buttons.find((button) => button.props.title === 'Add exercise');
    addExerciseButton?.props.onPress?.({} as never);

    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', { dayId: 'day-1' });
  });

  it('renders exercise list rows when exercises exist', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });
    const row = findElementsByType<React.ComponentProps<typeof ListRow>>(rowNode, ListRow)[0];

    expect(row.props.title).toBe('Bench Press');
  });

  it('disables Add exercise and blocks picker navigation at 50 planned exercises', () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `day-ex-${index + 1}`,
      program_day_id: 'day-1',
      exercise_id: `exercise-${index + 1}`,
      exercise_name: `Exercise ${index + 1}`,
      exercise_type: 'strength',
      position: index + 1,
      notes: null,
    }));
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(
      lists[0]?.props.ListHeaderComponent as React.ReactNode,
      Button,
    );
    const addExerciseButton = buttons.find((button) => button.props.title === 'Max 50 exercises');

    expect(addExerciseButton?.props.disabled).toBe(true);
    addExerciseButton?.props.onPress?.({} as never);
    expect(navigation.navigate).not.toHaveBeenCalledWith('ExercisePicker', { dayId: 'day-1' });
  });

  it('uses destructive red for the exercise delete icon', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const row = findElementsByType<React.ComponentProps<typeof ListRow>>(rowNode, ListRow)[0];
    const icons = findElementsByType<{ name: string; color?: string }>(row.props.right, Ionicons);
    const deleteIcon = icons.find((icon) => icon.props.name === 'trash-outline');

    expect(deleteIcon?.props.color).toBe(tokens.colors.destructive);
  });

  it('starts a workout in start-session mode', () => {
    (createSessionFromPlanDay as jest.Mock).mockReturnValue('session-1');

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: {
        key: 'DayDetail',
        name: 'DayDetail',
        params: { dayId: 'day-1', workoutPlanId: 'plan-1', mode: 'startSession' },
      },
    } as never);

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(element, Button);
    const startButton = buttons.find((button) => button.props.title === 'Start workout');
    startButton?.props.onPress?.({} as never);

    expect(createSessionFromPlanDay).toHaveBeenCalledWith({
      workoutPlanId: 'plan-1',
      dayId: 'day-1',
    });
    expect(getSessionById).toHaveBeenCalledWith('session-1');
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-1' });
  });

  it('does not navigate when created session cannot be verified', () => {
    const { Alert } = require('react-native');
    const setFeedback = jest.fn();
    useStateMock
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [[], jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, setFeedback]);
    (createSessionFromPlanDay as jest.Mock).mockReturnValue('session-missing');
    (getSessionById as jest.Mock).mockReturnValue(null);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: {
        key: 'DayDetail',
        name: 'DayDetail',
        params: { dayId: 'day-1', workoutPlanId: 'plan-1', mode: 'startSession' },
      },
    } as never);

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(element, Button);
    const startButton = buttons.find((button) => button.props.title === 'Start workout');
    startButton?.props.onPress?.({} as never);

    expect(getSessionById).toHaveBeenCalledWith('session-missing');
    expect(setFeedback).toHaveBeenCalledWith("Couldn't complete that action. Try again.");
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('resumes active workout in start-session mode', () => {
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'active-1' });

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: {
        key: 'DayDetail',
        name: 'DayDetail',
        params: { dayId: 'day-1', workoutPlanId: 'plan-1', mode: 'startSession' },
      },
    } as never);

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(element, Button);
    const startButton = buttons.find((button) => button.props.title === 'Start workout');
    startButton?.props.onPress?.({} as never);

    expect(createSessionFromPlanDay).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'active-1' });
  });

  it('uses bottomInset="none" for stack layout', () => {
    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const screens = findElementsByType<React.ComponentProps<typeof Screen>>(element, Screen);
    expect(screens[0]?.props.bottomInset).toBe('none');
  });

  it('keeps the local reordered list on drop before persisting reorder', () => {
    const initialItems = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
      {
        id: 'day-ex-2',
        program_day_id: 'day-1',
        exercise_id: 'row',
        exercise_name: 'Row',
        exercise_type: 'strength',
        position: 2,
        notes: null,
      },
    ];
    const reorderedItems = [initialItems[1], initialItems[0]];
    const setItems = jest.fn();
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [initialItems, setItems]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    lists[0]?.props.onDragEnd?.({ data: reorderedItems, from: 0, to: 1 });

    expect(setItems).toHaveBeenCalledWith(reorderedItems);
    expect(reorderDayExercises).toHaveBeenCalledWith('day-1', ['day-ex-2', 'day-ex-1']);
  });

  it('renders a non-empty placeholder row during drag', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const placeholderNode = lists[0]?.props.renderPlaceholder?.({ item: items[0], index: 0 });
    const placeholderRow = placeholderNode as React.ReactElement<
      React.ComponentProps<typeof ListRow>
    >;

    expect(placeholderRow.props.title).toBe('Bench Press');
    expect(placeholderRow.props.subtitle).toBe('Tap to view');
    expect(placeholderRow.props.showChevron).toBe(true);
    expect(placeholderRow.props.style).toBeUndefined();

    const placeholderActions = findElementsByType<{ disabled?: boolean }>(
      placeholderRow.props.right,
      require('react-native').Pressable,
    );
    expect(placeholderActions).toHaveLength(2);
    expect(placeholderActions.every((action) => action.props.disabled)).toBe(true);
  });

  it('renders planned sets when a strength exercise row is expanded', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const serialized = JSON.stringify(rowNode);
    expect(serialized).toContain('Hide planned sets');
    expect(findElementsByProp(rowNode, 'plannedSet')).toHaveLength(1);
  });

  it('editing planned-set reps calls update path', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const plannedSetEditor = findElementsByProp<{
      plannedSet: { id: string };
      onCommitReps: (plannedSet: { id: string }, value: string) => boolean;
    }>(rowNode, 'plannedSet')[0];
    plannedSetEditor?.props.onCommitReps(plannedSetEditor.props.plannedSet, '10');

    expect(updatePlannedSetTargets).toHaveBeenCalledWith('ps-1', { reps: 10 });
  });

  it('editing planned-set target weight calls update path', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const plannedSetEditor = findElementsByProp<{
      plannedSet: { id: string };
      onCommitTargetWeight: (plannedSet: { id: string }, value: string) => boolean;
    }>(rowNode, 'plannedSet')[0];
    plannedSetEditor?.props.onCommitTargetWeight(plannedSetEditor.props.plannedSet, '102,5');

    expect(updatePlannedSetTargets).toHaveBeenCalledWith('ps-1', { targetWeight: 102.5 });
  });

  it('Add Set button calls add path', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(rowNode, Button);
    buttons.find((button) => button.props.title === 'Add set')?.props.onPress?.({} as never);

    expect(addPlannedSetToDayExercise).toHaveBeenCalledWith('day-ex-1');
  });

  it('Delete planned set button calls delete path', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
          {
            id: 'ps-2',
            program_day_exercise_id: 'day-ex-1',
            set_index: 2,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const plannedSetDeletes = findElementsByType<React.ComponentProps<typeof Pressable>>(
      rowNode,
      Pressable,
    ).filter((pressable) => pressable.props.accessibilityLabel === 'Delete planned set');
    plannedSetDeletes[0]?.props.onPress?.({} as never);

    expect(deletePlannedSet).toHaveBeenCalledWith('ps-1');
    expect(plannedSetDeletes.every((pressable) => pressable.props.disabled === false)).toBe(true);
  });

  it('last planned-set delete button is disabled', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      {
        'day-ex-1': [
          {
            id: 'ps-1',
            program_day_exercise_id: 'day-ex-1',
            set_index: 1,
            target_reps_min: 8,
            target_reps_max: 8,
            target_weight: 100,
          },
        ],
      },
      jest.fn(),
    ]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const lists = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    );
    const renderItem = lists[0]?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });

    const plannedSetDeletes = findElementsByType<React.ComponentProps<typeof Pressable>>(
      rowNode,
      Pressable,
    ).filter((pressable) => pressable.props.accessibilityLabel === 'Delete planned set');

    expect(plannedSetDeletes[0]?.props.disabled).toBe(true);
  });
});
