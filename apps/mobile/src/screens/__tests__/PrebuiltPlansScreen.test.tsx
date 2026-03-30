jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    FlatList: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('FlatList', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      hairlineWidth: 1,
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

jest.mock('../../db/prebuiltPlansRepo', () => ({
  importPrebuiltPlan: jest.fn(),
  listPrebuiltPlans: jest.fn(),
}));

jest.mock('../../db/workoutPlanRepo', () => ({
  listDaysForWorkoutPlan: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  getInProgressSession: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Button } from '../../ui';
import { PrebuiltPlansScreen } from '../PrebuiltPlansScreen';
import { importPrebuiltPlan, listPrebuiltPlans } from '../../db/prebuiltPlansRepo';
import { getInProgressSession } from '../../db/workoutSessionRepo';

type Nav = {
  replace: jest.Mock;
};

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

describe('PrebuiltPlansScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    (listPrebuiltPlans as jest.Mock).mockReset();
    (importPrebuiltPlan as jest.Mock).mockReset();
    (getInProgressSession as jest.Mock).mockReset();
    (useNavigation as jest.Mock).mockReset();
  });

  it('does not navigate after import when there is an active session', () => {
    const navigation: Nav = { replace: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    (listPrebuiltPlans as jest.Mock).mockReturnValue([
      { id: 'tpl-1', name: 'PPL', description: null, dayCount: 3, existingPlanId: null },
    ]);
    (importPrebuiltPlan as jest.Mock).mockReturnValue('plan-123');
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-777' });

    const element = PrebuiltPlansScreen();

    type FlatListProps = React.ComponentProps<typeof FlatList>;
    const list = findElementByType<FlatListProps>(element, FlatList);
    if (!list?.props.renderItem) {
      throw new Error('Expected FlatList renderItem to be defined.');
    }

    const rowNode = list.props.renderItem({
      item: { id: 'tpl-1', name: 'PPL', description: null, dayCount: 3, existingPlanId: null },
      index: 0,
      separators: {
        highlight: jest.fn(),
        unhighlight: jest.fn(),
        updateProps: jest.fn(),
      },
    });

    type ButtonProps = React.ComponentProps<typeof Button>;
    const importButton = findElementByType<ButtonProps>(rowNode, Button);
    importButton?.props.onPress?.({} as never);

    expect(importPrebuiltPlan).toHaveBeenCalledWith('tpl-1');
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
