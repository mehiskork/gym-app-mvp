jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    FlatList: ({
      data,
      renderItem,
      ListEmptyComponent,
      ...props
    }: {
      data: unknown[];
      renderItem: (item: { item: unknown }) => React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) =>
      React.createElement(
        'FlatList',
        props,
        data.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
      ),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
    StyleSheet: { create: (x: unknown) => x },
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return { Ionicons: (props: unknown) => React.createElement('Ionicons', props) };
});

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: () => unknown) => fn,
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

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: jest.fn((payload: unknown) => ({ type: 'RESET', payload })),
  },
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock('../../db/exerciseRepo', () => ({ listSelectableExercisesForCurrentUser: jest.fn() }));
jest.mock('../../db/dayExerciseRepo', () => ({ addExerciseToDay: jest.fn() }));
jest.mock('../../db/workoutLoggerRepo', () => ({
  appendWorkoutSessionExercise: jest.fn(),
  swapWorkoutSessionExercise: jest.fn(),
}));
jest.mock('../../db/workoutSessionRepo', () => ({
  createQuickWorkoutSessionWithExercise: jest.fn(),
}));

import React from 'react';
import { FlatList, Pressable } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { ExercisePickerScreen } from '../ExercisePickerScreen';
import { Button } from '../../ui';
import { listSelectableExercisesForCurrentUser } from '../../db/exerciseRepo';
import {
  appendWorkoutSessionExercise,
  swapWorkoutSessionExercise,
} from '../../db/workoutLoggerRepo';
import { createQuickWorkoutSessionWithExercise } from '../../db/workoutSessionRepo';
import { WorkoutLimitError, WORKOUT_LIMIT_MESSAGES } from '../../db/workoutLimits';

const findByType = (
  node: React.ReactNode,
  type: React.ElementType | string,
  acc: React.ReactElement[] = [],
) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((x) => findByType(x, type, acc));
    return acc;
  }
  if (React.isValidElement(node)) {
    if (node.type === type) acc.push(node);
    findByType((node.props as { children?: React.ReactNode }).children, type, acc);
  }
  return acc;
};

describe('ExercisePickerScreen swap mode', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    (swapWorkoutSessionExercise as jest.Mock).mockReset();
    (appendWorkoutSessionExercise as jest.Mock).mockReset();
    (createQuickWorkoutSessionWithExercise as jest.Mock).mockReset();
    (CommonActions.reset as jest.Mock).mockClear();
    (listSelectableExercisesForCurrentUser as jest.Mock).mockReturnValue([
      { id: 'ex-2', name: 'Incline Bench', is_custom: 1 },
    ]);
  });

  it('does not render a close button in swap mode', () => {
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      [{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }],
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const element = ExercisePickerScreen({
      navigation,
      route: {
        key: 'ExercisePicker',
        name: 'ExercisePicker',
        params: { swapSessionId: 's1', swapSessionExerciseId: 'wse-1' },
      },
    } as never);

    const buttons = findByType(element, Button);
    const closeButton = buttons.find((b) => (b.props as { title?: string }).title === 'Close');
    expect(closeButton).toBeUndefined();
    expect(swapWorkoutSessionExercise).not.toHaveBeenCalled();
  });

  it('renders chips in one row without group labels and pins a secondary custom exercise CTA', () => {
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      [{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }],
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const element = ExercisePickerScreen({
      navigation,
      route: {
        key: 'ExercisePicker',
        name: 'ExercisePicker',
        params: { swapSessionId: 's1', swapSessionExerciseId: 'wse-1' },
      },
    } as never);

    const buttons = findByType(element, Button);
    const createCta = buttons.find(
      (b) => (b.props as { title?: string }).title === 'Create a custom exercise',
    );
    expect(createCta).toBeDefined();
    const createCtaProps = createCta?.props as {
      variant?: string;
      onPress?: (event: never) => void;
    };
    expect(createCtaProps.variant).toBe('secondary');
    createCtaProps.onPress?.({} as never);
    expect(navigation.navigate).toHaveBeenCalledWith('CreateExercise');

    const textContent = JSON.stringify(element);
    expect(textContent).toContain('Create a custom exercise');
    expect(textContent).toContain('Strength');
    expect(textContent).toContain('Cardio');
    expect(textContent).toContain('Curated');
    expect(textContent).toContain('Custom');
    expect(textContent).not.toContain('Type');
    expect(textContent).not.toContain('Source');
  });

  it('shows the exercise limit message when adding to an active workout is rejected', () => {
    const setFeedback = jest.fn();
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      [{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }],
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, setFeedback]);
    (appendWorkoutSessionExercise as jest.Mock).mockImplementationOnce(() => {
      throw new WorkoutLimitError(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    });

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const element = ExercisePickerScreen({
      navigation,
      route: {
        key: 'ExercisePicker',
        name: 'ExercisePicker',
        params: { addToSessionId: 'session-1' },
      },
    } as never);

    const lists = findByType(element, FlatList) as Array<
      React.ReactElement<{
        renderItem?: (input: {
          item: { id: string; name: string; is_custom: number };
        }) => React.ReactNode;
      }>
    >;
    const renderItem = lists[0]?.props.renderItem as
      | ((input: { item: { id: string; name: string; is_custom: number } }) => React.ReactNode)
      | undefined;
    const row = renderItem?.({ item: { id: 'ex-2', name: 'Incline Bench', is_custom: 1 } });
    const pressables = findByType(row, Pressable) as Array<
      React.ReactElement<{ accessibilityLabel?: string; onPress?: () => void }>
    >;
    const selectExercise = pressables.find(
      (pressable) => pressable.props.accessibilityLabel === 'Select Incline Bench',
    );
    selectExercise?.props.onPress?.();

    expect(setFeedback).toHaveBeenCalledWith(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('creates the first Quick Workout exercise from draft mode and replaces the stack', () => {
    useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
    useStateMock.mockImplementationOnce(() => [
      [{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }],
      jest.fn(),
    ]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
    (createQuickWorkoutSessionWithExercise as jest.Mock).mockReturnValueOnce({
      sessionId: 'quick-session-1',
      focusExerciseId: 'wse-1',
    });

    const navigation = { dispatch: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
    const element = ExercisePickerScreen({
      navigation,
      route: {
        key: 'ExercisePicker',
        name: 'ExercisePicker',
        params: { quickWorkoutDraft: true },
      },
    } as never);

    const lists = findByType(element, FlatList) as Array<
      React.ReactElement<{
        renderItem?: (input: {
          item: { id: string; name: string; is_custom: number };
        }) => React.ReactNode;
      }>
    >;
    const renderItem = lists[0]?.props.renderItem as
      | ((input: { item: { id: string; name: string; is_custom: number } }) => React.ReactNode)
      | undefined;
    const row = renderItem?.({ item: { id: 'ex-2', name: 'Incline Bench', is_custom: 1 } });
    const pressables = findByType(row, Pressable) as Array<
      React.ReactElement<{ accessibilityLabel?: string; onPress?: () => void }>
    >;
    const selectExercise = pressables.find(
      (pressable) => pressable.props.accessibilityLabel === 'Select Incline Bench',
    );
    selectExercise?.props.onPress?.();

    expect(createQuickWorkoutSessionWithExercise).toHaveBeenCalledWith({
      exerciseId: 'ex-2',
      exerciseName: 'Incline Bench',
    });
    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'WorkoutSession', params: { sessionId: 'quick-session-1' } },
      ],
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'WorkoutSession', params: { sessionId: 'quick-session-1' } },
        ],
      },
    });
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(appendWorkoutSessionExercise).not.toHaveBeenCalled();
  });
});
