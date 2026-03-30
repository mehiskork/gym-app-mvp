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

jest.mock('react-native', () => {
  const React = require('react');

  return {
    Alert: { alert: jest.fn() },
    FlatList: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('FlatList', props, children),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    StyleSheet: {
      create: (styles: any) => styles,
      hairlineWidth: 1,
      absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    },
    Modal: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Modal', props, children),
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

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../db/workoutPlanRepo', () => ({
  createWorkoutPlan: jest.fn(),
  deleteWorkoutPlan: jest.fn(),
  listWorkoutPlansWithSessionCounts: jest.fn(),
  listWorkoutPlans: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Button } from '../../ui';
import { WorkoutPlansScreen } from '../WorkoutPlansScreen';
import { createWorkoutPlan, listWorkoutPlans } from '../../db/workoutPlanRepo';

type Nav = { navigate: jest.Mock };

const findElementByType = <P,>(
  node: React.ReactNode,
  type: React.ElementType,
): React.ReactElement<P> | null => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType<P>(child, type);
      if (found) return found;
    }
    return null;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if (node.type === type) return node as React.ReactElement<P>;
    return findElementByType<P>(node.props.children, type);
  }
  return null;
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

describe('WorkoutPlansScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial) => [initial, jest.fn()]);
    (listWorkoutPlans as jest.Mock).mockReset();
    (createWorkoutPlan as jest.Mock).mockReset();
    (useNavigation as jest.Mock).mockReturnValue({ navigate: jest.fn() });
  });

  it('renders Create Plan and Templates buttons', () => {
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

    const element = WorkoutPlansScreen();
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);

    expect(buttons.some((button) => button.props.title === '+ Create Plan')).toBe(true);
    expect(buttons.some((button) => button.props.title === 'Templates')).toBe(true);
  });

  it('renders Templates as primary with flash icon', () => {
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

    const element = WorkoutPlansScreen();
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    const templatesButton = buttons.find((button) => button.props.title === 'Templates');

    expect(templatesButton?.props.variant).toBe('primary');
    if (!templatesButton?.props.leftIcon || !React.isValidElement(templatesButton.props.leftIcon)) {
      throw new Error('Expected Templates button leftIcon.');
    }

    const iconElement = templatesButton.props.leftIcon as React.ReactElement<{
      name?: string;
      size?: number;
    }>;

    expect((iconElement.type as { name?: string }).name).toBe('Ionicons');
    expect(iconElement.props.name).toBe('flash-outline');
    expect(iconElement.props.size).toBe(16);
  });
  it('navigates to templates when Templates button is pressed', () => {
    const navigation: Nav = { navigate: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

    const element = WorkoutPlansScreen();
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    const templatesButton = buttons.find((button) => button.props.title === 'Templates');
    if (!templatesButton?.props.onPress) throw new Error('Expected Templates button onPress.');

    templatesButton.props.onPress({} as never);

    expect(navigation.navigate).toHaveBeenCalledWith('PrebuiltPlans');
  });

  it('navigates to plan detail when a plan has sessions', () => {
    const plans = [
      { id: 'plan-1', name: 'Plan A', description: null, is_template: 0, sessionCount: 2 },
    ];
    const navigation: Nav = { navigate: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

    const element = WorkoutPlansScreen();
    type FlatListProps = React.ComponentProps<typeof FlatList>;
    const list = findElementByType<FlatListProps>(element, FlatList);
    const renderItem = list?.props.renderItem;
    if (!renderItem) throw new Error('Expected FlatList renderItem to be defined.');

    const rowNode = renderItem({
      item: plans[0],
      index: 0,
      separators: {
        highlight: jest.fn(),
        unhighlight: jest.fn(),
        updateProps: jest.fn(),
      },
    });
    if (!React.isValidElement(rowNode)) throw new Error('Expected plan row element.');

    const row = rowNode as React.ReactElement<{ onPress?: () => void; showChevron: boolean }>;
    expect(row.props.showChevron).toBe(true);
    row.props.onPress?.();

    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanDetail', {
      workoutPlanId: 'plan-1',
    });
  });

  it('shows session count subtitles and disables zero-session plan navigation', () => {
    const plans = [
      { id: 'plan-1', name: 'Plan A', description: null, is_template: 0, sessionCount: 1 },
      { id: 'plan-2', name: 'Plan B', description: null, is_template: 0, sessionCount: 4 },
      { id: 'plan-3', name: 'Plan C', description: null, is_template: 0, sessionCount: 0 },
    ];

    useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

    const element = WorkoutPlansScreen();

    type FlatListProps = React.ComponentProps<typeof FlatList>;
    const list = findElementByType<FlatListProps>(element, FlatList);
    const renderItem = list?.props.renderItem;
    if (!renderItem) throw new Error('Expected FlatList renderItem to be defined.');

    const makeRow = (index: number) => {
      const rowNode = renderItem({
        item: plans[index],
        index,
        separators: {
          highlight: jest.fn(),
          unhighlight: jest.fn(),
          updateProps: jest.fn(),
        },
      });
      if (!React.isValidElement(rowNode)) throw new Error('Expected plan row element.');
      return rowNode as React.ReactElement<{
        subtitle: string;
        showChevron: boolean;
        onPress?: () => void;
      }>;
    };

    expect(makeRow(0).props.subtitle).toBe('1 session');
    expect(makeRow(1).props.subtitle).toBe('4 sessions');
    expect(makeRow(2).props.subtitle).toBe('No sessions yet');
    expect(makeRow(2).props.showChevron).toBe(false);
    expect(makeRow(2).props.onPress).toBeUndefined();
  });

  it('creates next numbered plan and navigates to detail', () => {
    const navigation: Nav = { navigate: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (listWorkoutPlans as jest.Mock).mockReturnValue([
      { id: 'plan-1', name: 'Plan 1', description: null, is_template: 0 },
      { id: 'plan-2', name: 'Plan 2', description: null, is_template: 0 },
      { id: 'plan-a', name: 'Summer Split', description: null, is_template: 0 },
    ]);
    (createWorkoutPlan as jest.Mock).mockReturnValue('new-plan-id');

    const element = WorkoutPlansScreen();
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    const createButton = buttons.find((button) => button.props.title === '+ Create Plan');
    if (!createButton?.props.onPress) throw new Error('Expected Create Plan button onPress.');

    createButton.props.onPress({} as never);

    expect(createWorkoutPlan).toHaveBeenCalledWith({ name: 'Plan 3' });
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanDetail', {
      workoutPlanId: 'new-plan-id',
    });
  });

  it('creates Plan 1 when no existing numbered plans are present', () => {
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (listWorkoutPlans as jest.Mock).mockReturnValue([]);
    (createWorkoutPlan as jest.Mock).mockReturnValue('new-plan-id');

    const element = WorkoutPlansScreen();
    type ButtonProps = React.ComponentProps<typeof Button>;
    const buttons = findElementsByType<ButtonProps>(element, Button);
    const createButton = buttons.find((button) => button.props.title === '+ Create Plan');
    if (!createButton?.props.onPress) throw new Error('Expected Create Plan button onPress.');

    createButton.props.onPress({} as never);

    expect(createWorkoutPlan).toHaveBeenCalledWith({ name: 'Plan 1' });
  });
});
