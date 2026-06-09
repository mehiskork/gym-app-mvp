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
    useEffect: (fn: () => unknown) => fn(),
    useRef: jest.fn(() => ({ current: null })),
  };
});

const useStateSetters: jest.Mock[] = [];

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
    Keyboard: { dismiss: jest.fn() },
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
  updateDayExerciseNote: jest.fn(),
  updatePlannedCardioTarget: jest.fn(),
  updatePlannedSetTargets: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  createSessionFromPlanDay: jest.fn(),
  getInProgressSession: jest.fn(),
  getSessionById: jest.fn(),
}));

import React from 'react';
import { Pressable, TextInput } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, Button, EmptyState, Input, ListRow, Screen, Text } from '../../ui';
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
  updateDayExerciseNote,
  updatePlannedCardioTarget,
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

const renderComponentElement = <P extends Record<string, unknown>>(
  element: React.ReactElement<P>,
): React.ReactElement => (element.type as (props: P) => React.ReactElement)(element.props);

const renderPlannedSetRows = (node: React.ReactNode) =>
  findElementsByProp<{
    plannedSet: { id: string };
  }>(node, 'plannedSet').map((row) => renderComponentElement(row));

describe('DayDetailScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateSetters.length = 0;
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => {
      const setter = jest.fn();
      useStateSetters.push(setter);
      return [initial, setter];
    });
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
    (updatePlannedCardioTarget as jest.Mock).mockReset();
    (updateDayExerciseNote as jest.Mock).mockReset();
  });

  const renderExpandedCardioEditor = (item: Record<string, unknown>) => {
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[item], jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [item.id, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{}, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const list = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    )[0];
    const renderItem = list?.props.renderItem as (
      params: RenderItemParams<Record<string, unknown>>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item,
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });
    const editor = findElementsByProp<{ exercise: Record<string, unknown> }>(
      rowNode,
      'exercise',
    )[0];
    return renderComponentElement(editor);
  };

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

  it('renders compact planned-set rows with one header when a strength exercise row is expanded', () => {
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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
            target_reps_min: 10,
            target_reps_max: 10,
            target_weight: 105,
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

    const texts = findElementsByType<React.ComponentProps<typeof Text>>(rowNode, Text);
    expect(texts.filter((text) => text.props.children === 'SET')).toHaveLength(1);
    expect(texts.filter((text) => text.props.children === 'WEIGHT')).toHaveLength(1);
    expect(texts.filter((text) => text.props.children === 'REPS')).toHaveLength(1);
    expect(texts.filter((text) => text.props.children === 'Weight')).toHaveLength(0);
    expect(texts.filter((text) => text.props.children === 'Reps')).toHaveLength(0);

    const plannedSetRows = findElementsByProp<{
      plannedSet: { id: string };
    }>(rowNode, 'plannedSet');
    expect(plannedSetRows).toHaveLength(2);

    const renderedRows = renderPlannedSetRows(rowNode);
    const weightInputs = renderedRows.flatMap((row) =>
      findElementsByType<React.ComponentProps<typeof TextInput>>(row, TextInput).filter(
        (input) => input.props.testID === 'planned-set-weight-input',
      ),
    );
    const repsInputs = renderedRows.flatMap((row) =>
      findElementsByType<React.ComponentProps<typeof TextInput>>(row, TextInput).filter(
        (input) => input.props.testID === 'planned-set-reps-input',
      ),
    );
    expect(weightInputs).toHaveLength(2);
    expect(repsInputs).toHaveLength(2);
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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

  it('cardio exercise rows do not render planned-set controls', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'run',
        exercise_name: 'Run',
        exercise_type: 'cardio',
        position: 1,
        notes: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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

    const texts = findElementsByType<React.ComponentProps<typeof Text>>(rowNode, Text);
    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(rowNode, Button);
    const plannedSetDeletes = findElementsByType<React.ComponentProps<typeof Pressable>>(
      rowNode,
      Pressable,
    ).filter((pressable) => pressable.props.accessibilityLabel === 'Delete planned set');

    expect(texts.some((text) => text.props.children === 'SET')).toBe(false);
    expect(texts.some((text) => text.props.children === 'WEIGHT')).toBe(false);
    expect(texts.some((text) => text.props.children === 'REPS')).toBe(false);
    expect(buttons.some((button) => button.props.title === 'Add Set')).toBe(false);
    expect(findElementsByProp(rowNode, 'plannedSet')).toHaveLength(0);
    expect(plannedSetDeletes).toHaveLength(0);
  });

  it('renders copied treadmill targets in the cardio target editor', () => {
    const items = [
      {
        id: 'day-ex-cardio',
        program_day_id: 'day-1',
        exercise_id: 'treadmill',
        exercise_name: 'Treadmill',
        exercise_type: 'cardio',
        cardio_profile: 'treadmill',
        position: 1,
        notes: null,
        planned_cardio_duration_minutes: 20,
        planned_cardio_distance_km: 3,
        planned_cardio_speed_kph: 9.5,
        planned_cardio_incline_percent: 2,
        planned_cardio_resistance_level: null,
        planned_cardio_pace_seconds_per_km: null,
        planned_cardio_floors: null,
        planned_cardio_stair_level: null,
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Conditioning', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-cardio', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{}, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);
    const list = findElementsByType<React.ComponentProps<typeof DraggableFlatList>>(
      element,
      DraggableFlatList,
    )[0];
    const renderItem = list?.props.renderItem as (
      params: RenderItemParams<(typeof items)[number]>,
    ) => React.ReactElement;
    const rowNode = renderItem({
      item: items[0],
      drag: jest.fn(),
      isActive: false,
      getIndex: () => 0,
    });
    const editor = findElementsByProp<{ exercise: (typeof items)[number] }>(rowNode, 'exercise')[0];
    const editorNode = renderComponentElement(editor);
    const inputs = findElementsByType<React.ComponentProps<typeof Input>>(editorNode, Input);

    expect(inputs.map((input) => [input.props.label, input.props.value])).toEqual([
      ['Duration (min)', '20'],
      ['Distance (km)', '3'],
      ['Speed (km/h)', '9,5'],
      ['Incline (%)', '2'],
    ]);
  });

  it('expanding a cardio exercise row does not resync unchanged target text state', () => {
    const item = {
      id: 'day-ex-cardio',
      program_day_id: 'day-1',
      exercise_id: 'treadmill',
      exercise_name: 'Treadmill',
      exercise_type: 'cardio',
      cardio_profile: 'treadmill',
      position: 1,
      notes: null,
      planned_cardio_duration_minutes: 20,
      planned_cardio_distance_km: 3,
      planned_cardio_speed_kph: 9.5,
      planned_cardio_incline_percent: 2,
      planned_cardio_resistance_level: null,
      planned_cardio_pace_seconds_per_km: null,
      planned_cardio_floors: null,
      planned_cardio_stair_level: null,
    };

    renderExpandedCardioEditor(item);

    const cardioTextSetter = useStateSetters.at(-1);
    const syncUpdater = cardioTextSetter?.mock.calls.at(-1)?.[0];
    const current = {
      duration_minutes: '20',
      distance_km: '3',
      speed_kph: '9,5',
      incline_percent: '2',
      resistance_level: '',
      pace_seconds_per_km: '',
      floors: '',
      stair_level: '',
    };

    expect(typeof syncUpdater).toBe('function');
    expect(syncUpdater(current)).toBe(current);
  });

  it('saving treadmill cardio targets calls the planned-cardio update path', () => {
    const item = {
      id: 'day-ex-cardio',
      program_day_id: 'day-1',
      exercise_id: 'treadmill',
      exercise_name: 'Treadmill',
      exercise_type: 'cardio',
      cardio_profile: 'treadmill',
      position: 1,
      notes: null,
      planned_cardio_duration_minutes: null,
      planned_cardio_distance_km: null,
      planned_cardio_speed_kph: null,
      planned_cardio_incline_percent: null,
      planned_cardio_resistance_level: null,
      planned_cardio_pace_seconds_per_km: null,
      planned_cardio_floors: null,
      planned_cardio_stair_level: null,
    };
    const editorNode = renderExpandedCardioEditor(item);
    const inputs = findElementsByType<React.ComponentProps<typeof Input>>(editorNode, Input);

    inputs[0]?.props.onEndEditing?.({ nativeEvent: { text: '20' } } as never);
    inputs[1]?.props.onEndEditing?.({ nativeEvent: { text: '3' } } as never);
    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: '9.5' } } as never);
    inputs[3]?.props.onEndEditing?.({ nativeEvent: { text: '2' } } as never);

    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-cardio', {
      duration_minutes: 20,
    });
    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-cardio', { distance_km: 3 });
    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-cardio', { speed_kph: 9.5 });
    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-cardio', {
      incline_percent: 2,
    });
  });

  it('saving ergometer pace shorthand and empty values works through planned-cardio updates', () => {
    const item = {
      id: 'day-ex-row',
      program_day_id: 'day-1',
      exercise_id: 'row',
      exercise_name: 'Rowing Machine',
      exercise_type: 'cardio',
      cardio_profile: 'ergometer',
      position: 1,
      notes: null,
      planned_cardio_duration_minutes: null,
      planned_cardio_distance_km: null,
      planned_cardio_speed_kph: null,
      planned_cardio_incline_percent: null,
      planned_cardio_resistance_level: null,
      planned_cardio_pace_seconds_per_km: null,
      planned_cardio_floors: null,
      planned_cardio_stair_level: null,
    };
    const editorNode = renderExpandedCardioEditor(item);
    const inputs = findElementsByType<React.ComponentProps<typeof Input>>(editorNode, Input);

    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: '530' } } as never);
    inputs[1]?.props.onEndEditing?.({ nativeEvent: { text: '' } } as never);

    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-row', {
      pace_seconds_per_km: 330,
    });
    expect(updatePlannedCardioTarget).toHaveBeenCalledWith('day-ex-row', { distance_km: null });
  });

  it('invalid planned cardio values are not persisted', () => {
    const item = {
      id: 'day-ex-row',
      program_day_id: 'day-1',
      exercise_id: 'row',
      exercise_name: 'Rowing Machine',
      exercise_type: 'cardio',
      cardio_profile: 'ergometer',
      position: 1,
      notes: null,
      planned_cardio_duration_minutes: null,
      planned_cardio_distance_km: null,
      planned_cardio_speed_kph: null,
      planned_cardio_incline_percent: null,
      planned_cardio_resistance_level: null,
      planned_cardio_pace_seconds_per_km: null,
      planned_cardio_floors: null,
      planned_cardio_stair_level: null,
    };
    const editorNode = renderExpandedCardioEditor(item);
    const inputs = findElementsByType<React.ComponentProps<typeof Input>>(editorNode, Input);

    inputs[2]?.props.onEndEditing?.({ nativeEvent: { text: '5:99' } } as never);

    expect(updatePlannedCardioTarget).not.toHaveBeenCalled();
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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
    buttons.find((button) => button.props.title === 'Add Set')?.props.onPress?.({} as never);

    expect(addPlannedSetToDayExercise).toHaveBeenCalledWith('day-ex-1');
  });

  it('renders Add Note/View Note left of Add Set for expanded strength exercises', () => {
    const items = [
      {
        id: 'day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        exercise_type: 'strength',
        position: 1,
        notes: 'Pause on the first rep',
      },
    ];
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [items, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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
    expect(buttons.map((button) => button.props.title).slice(-2)).toEqual(['View Note', 'Add Set']);
  });

  it('saves and clears a plan exercise note from the sheet', () => {
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['day-ex-1', jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['Plan note draft', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [{}, jest.fn()]);

    const navigation: Nav = { navigate: jest.fn(), replace: jest.fn(), setOptions: jest.fn() };
    const element = DayDetailScreen({
      navigation,
      route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
    } as never);

    const sheets = findElementsByType<React.ComponentProps<typeof BottomSheetModal>>(
      element,
      BottomSheetModal,
    );
    expect(sheets[0]?.props.title).toBe('Bench Press Note');
    const inputs = findElementsByType<React.ComponentProps<typeof Input>>(sheets[0], Input);
    expect(inputs[0]?.props.maxLength).toBe(200);
    expect(inputs[0]?.props.helperText).toBe('15/200');

    const buttons = findElementsByType<React.ComponentProps<typeof Button>>(
      sheets[0]?.props.actions as React.ReactNode,
      Button,
    );
    buttons.find((button) => button.props.title === 'Save')?.props.onPress?.({} as never);
    expect(updateDayExerciseNote).toHaveBeenCalledWith('day-ex-1', 'Plan note draft');

    buttons.find((button) => button.props.title === 'Clear')?.props.onPress?.({} as never);
    expect(updateDayExerciseNote).toHaveBeenCalledWith('day-ex-1', null);
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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

    const plannedSetDeletes = renderPlannedSetRows(rowNode).flatMap((plannedSetRow) =>
      findElementsByType<React.ComponentProps<typeof Pressable>>(plannedSetRow, Pressable).filter(
        (pressable) => pressable.props.accessibilityLabel === 'Delete planned set',
      ),
    );
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
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
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

    const plannedSetDeletes = renderPlannedSetRows(rowNode).flatMap((plannedSetRow) =>
      findElementsByType<React.ComponentProps<typeof Pressable>>(plannedSetRow, Pressable).filter(
        (pressable) => pressable.props.accessibilityLabel === 'Delete planned set',
      ),
    );

    expect(plannedSetDeletes[0]?.props.disabled).toBe(true);
  });
});
