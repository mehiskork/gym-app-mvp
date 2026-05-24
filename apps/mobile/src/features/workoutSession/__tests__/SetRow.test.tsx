const mockUseStateSetters: jest.Mock[] = [];

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn((initial: unknown) => {
      const setState = jest.fn();
      mockUseStateSetters.push(setState);
      return [initial, setState];
    }),
    useRef: jest.fn(() => ({ current: null })),
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => unknown) => fn(),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Keyboard: {
      dismiss: jest.fn(),
    },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('TextInput', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (styles: unknown) =>
        Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles,
    },
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
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

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SetRow } from '../SetRow';
import { SET_ACTIONS_WIDTH, SET_NUMBER_COLUMN_WIDTH } from '../setRowLayout';

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

const findElementByTestId = <P,>(
  node: React.ReactNode,
  testID: string,
): React.ReactElement<P> | undefined => {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByTestId<P>(child, testID);
      if (found) return found;
    }
    return undefined;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    const props = node.props as { testID?: string; children?: React.ReactNode };
    if (props?.testID === testID) return node as React.ReactElement<P>;
    return findElementByTestId<P>(props?.children, testID);
  }
  return undefined;
};

const createSet = (overrides?: Partial<React.ComponentProps<typeof SetRow>['set']>) => ({
  id: 'set-1',
  workout_session_exercise_id: 'exercise-1',
  set_index: 1,
  weight: 100,
  reps: 8,
  rpe: null,
  rest_seconds: 90,
  notes: null,
  is_completed: 0,
  ...overrides,
});

beforeEach(() => {
  mockUseStateSetters.length = 0;
});

describe('SetRow layout sizing', () => {
  it('uses a compact set column, equal flex inputs, and a fixed right actions width', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const views = findElementsByType(element, View) as Array<
      React.ReactElement<{ style?: unknown }>
    >;

    const setColumnView = views.find((view) => {
      const style = StyleSheet.flatten(view.props.style) as { width?: number };
      return style?.width === SET_NUMBER_COLUMN_WIDTH;
    });
    const inputWrappers = views.filter((view) => {
      const style = StyleSheet.flatten(view.props.style) as {
        flex?: number;
        minWidth?: number;
        overflow?: string;
      };
      return style?.flex === 1 && style?.minWidth === 0 && style?.overflow === 'hidden';
    });
    const rightActionsView = views.find((view) => {
      const style = StyleSheet.flatten(view.props.style) as { width?: number };
      return style?.width === SET_ACTIONS_WIDTH;
    });

    expect(setColumnView).toBeDefined();
    expect(inputWrappers).toHaveLength(2);
    expect(rightActionsView).toBeDefined();
  });
  it('matches set number typography with numeric inputs and centers values', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const setNumber = findElementByTestId<{ style?: unknown }>(element, 'set-number');
    const weightInput = findElementByTestId<{ style?: unknown }>(element, 'weight-input');
    const repsInput = findElementByTestId<{ style?: unknown }>(element, 'reps-input');

    const setNumberStyle = StyleSheet.flatten(setNumber?.props.style) as {
      fontSize?: number;
      fontWeight?: string;
      lineHeight?: number;
    };
    const weightStyle = StyleSheet.flatten(weightInput?.props.style) as {
      fontSize?: number;
      fontWeight?: string;
      lineHeight?: number;
      textAlign?: string;
    };
    const repsStyle = StyleSheet.flatten(repsInput?.props.style) as {
      textAlign?: string;
    };

    expect(setNumberStyle).toMatchObject({
      fontSize: weightStyle.fontSize,
      fontWeight: weightStyle.fontWeight,
      lineHeight: weightStyle.lineHeight,
    });
    expect(weightStyle).toMatchObject({ textAlign: 'center' });
    expect(repsStyle).toMatchObject({ textAlign: 'center' });
  });

  it('renders two-digit set numbers without truncating the value', () => {
    const element = SetRow({
      set: { ...createSet(), set_index: 10 },
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const setNumber = findElementByTestId<{ children?: React.ReactNode }>(element, 'set-number');

    expect(setNumber?.props.children).toBe(10);
    expect(String(setNumber?.props.children)).toBe('10');
  });
});

describe('SetRow input focus behavior', () => {
  it('applies explicit max lengths to weight and reps fields', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const weightInput = findElementByTestId<{ maxLength?: number }>(element, 'weight-input');
    const repsInput = findElementByTestId<{ maxLength?: number }>(element, 'reps-input');

    expect(weightInput?.props.maxLength).toBe(6);
    expect(repsInput?.props.maxLength).toBe(3);
  });

  it('preserves weight and reps testIDs and applies return-key behavior', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const weightInput = findElementByTestId<{ returnKeyType?: string }>(element, 'weight-input');
    const repsInput = findElementByTestId<{ returnKeyType?: string }>(element, 'reps-input');

    expect(weightInput).toBeDefined();
    expect(repsInput).toBeDefined();
    expect(weightInput?.props.returnKeyType).toBe('next');
    expect(repsInput?.props.returnKeyType).toBe('done');
  });

  it('enables select-all on focus for weight and reps inputs so next digit replaces value', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const weightInput = findElementByTestId<{ selectTextOnFocus?: boolean }>(
      element,
      'weight-input',
    );
    const repsInput = findElementByTestId<{ selectTextOnFocus?: boolean }>(element, 'reps-input');

    expect(weightInput?.props.selectTextOnFocus).toBe(true);
    expect(repsInput?.props.selectTextOnFocus).toBe(true);
  });

  it('keeps existing values unchanged on focus without editing', () => {
    const element = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const weightInput = findElementByTestId<{ value?: string }>(element, 'weight-input');
    const repsInput = findElementByTestId<{ value?: string }>(element, 'reps-input');

    expect(weightInput?.props.value).toBe('100');
    expect(repsInput?.props.value).toBe('8');
  });

  it('displays saved decimal weight with a comma separator', () => {
    const element = SetRow({
      set: createSet({ weight: 82.5 }),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const weightInput = findElementByTestId<{ value?: string }>(element, 'weight-input');

    expect(weightInput?.props.value).toBe('82,5');
  });

  it('formats dot decimal weight with comma after accepted end editing', () => {
    const onWeightEndEditing = jest.fn(() => true);
    const element = SetRow({
      set: createSet({ weight: 82 }),
      onWeightEndEditing,
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });
    const weightInput = findElementByTestId<{
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element, 'weight-input');
    const weightSetter = mockUseStateSetters[0];
    weightSetter?.mockClear();

    weightInput?.props.onEndEditing?.({ nativeEvent: { text: '82.5' } });

    expect(onWeightEndEditing).toHaveBeenCalledWith('82.5');
    expect(weightSetter).toHaveBeenCalledWith('82,5');
  });

  it('keeps comma decimal weight after accepted end editing', () => {
    const onWeightEndEditing = jest.fn(() => true);
    const element = SetRow({
      set: createSet({ weight: 82 }),
      onWeightEndEditing,
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });
    const weightInput = findElementByTestId<{
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element, 'weight-input');
    const weightSetter = mockUseStateSetters[0];
    weightSetter?.mockClear();

    weightInput?.props.onEndEditing?.({ nativeEvent: { text: '82,5' } });

    expect(onWeightEndEditing).toHaveBeenCalledWith('82,5');
    expect(weightSetter).toHaveBeenCalledWith('82,5');
  });

  it('resets invalid weight to the previous saved value without calling the save handler', () => {
    const onWeightEndEditing = jest.fn(() => true);
    const element = SetRow({
      set: createSet({ weight: 82.5 }),
      onWeightEndEditing,
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });
    const weightInput = findElementByTestId<{
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element, 'weight-input');
    const weightSetter = mockUseStateSetters[0];
    weightSetter?.mockClear();

    weightInput?.props.onEndEditing?.({ nativeEvent: { text: '1e9' } });

    expect(onWeightEndEditing).not.toHaveBeenCalled();
    expect(weightSetter).toHaveBeenCalledWith('82,5');
  });

  it('resets invalid reps to the previous saved value without calling the save handler', () => {
    const onRepsEndEditing = jest.fn(() => true);
    const element = SetRow({
      set: createSet({ reps: 8 }),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing,
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });
    const repsInput = findElementByTestId<{
      onEndEditing?: (event: { nativeEvent: { text: string } }) => void;
    }>(element, 'reps-input');
    const repsSetter = mockUseStateSetters[1];
    repsSetter?.mockClear();

    repsInput?.props.onEndEditing?.({ nativeEvent: { text: '10.5' } });

    expect(onRepsEndEditing).not.toHaveBeenCalled();
    expect(repsSetter).toHaveBeenCalledWith('8');
  });

  it('keeps select-all enabled on repeated renders/focus cycles', () => {
    const firstRender = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });
    const secondRender = SetRow({
      set: createSet(),
      onWeightEndEditing: jest.fn(() => true),
      onRepsEndEditing: jest.fn(() => true),
      onToggleComplete: jest.fn(),
      onDelete: jest.fn(),
    });

    const firstWeight = findElementByTestId<{ selectTextOnFocus?: boolean }>(
      firstRender,
      'weight-input',
    );
    const secondWeight = findElementByTestId<{ selectTextOnFocus?: boolean }>(
      secondRender,
      'weight-input',
    );
    const firstReps = findElementByTestId<{ selectTextOnFocus?: boolean }>(
      firstRender,
      'reps-input',
    );
    const secondReps = findElementByTestId<{ selectTextOnFocus?: boolean }>(
      secondRender,
      'reps-input',
    );

    expect(firstWeight?.props.selectTextOnFocus).toBe(true);
    expect(secondWeight?.props.selectTextOnFocus).toBe(true);
    expect(firstReps?.props.selectTextOnFocus).toBe(true);
    expect(secondReps?.props.selectTextOnFocus).toBe(true);
  });
});
