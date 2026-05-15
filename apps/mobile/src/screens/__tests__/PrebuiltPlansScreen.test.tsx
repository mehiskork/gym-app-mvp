jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
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

import React from 'react';
import { FlatList, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { PrebuiltPlansScreen } from '../PrebuiltPlansScreen';
import { importPrebuiltPlan, listPrebuiltPlans } from '../../db/prebuiltPlansRepo';

type Nav = {
  navigate: jest.Mock;
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

function textContent(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) {
    return textContent((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

describe('PrebuiltPlansScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      jest.fn(),
    ]);
    (listPrebuiltPlans as jest.Mock).mockReset();
    (importPrebuiltPlan as jest.Mock).mockReset();
    (useFocusEffect as jest.Mock).mockReset();
    (useFocusEffect as jest.Mock).mockImplementation((callback: () => void) => callback());
    (useNavigation as jest.Mock).mockReset();
  });

  function renderFirstTemplateRow(element: React.ReactNode) {
    type FlatListProps = React.ComponentProps<typeof FlatList>;
    const list = findElementByType<FlatListProps>(element, FlatList);
    if (!list?.props.renderItem) {
      throw new Error('Expected FlatList renderItem to be defined.');
    }

    return list.props.renderItem({
      item: {
        id: 'tpl-1',
        name: 'PPL',
        description: 'Push pull legs',
        dayCount: 3,
        existingPlanId: null,
      },
      index: 0,
      separators: {
        highlight: jest.fn(),
        unhighlight: jest.fn(),
        updateProps: jest.fn(),
      },
    });
  }

  it('renders templates without import intro or Add buttons', () => {
    const navigation: Nav = { navigate: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    (listPrebuiltPlans as jest.Mock).mockReturnValue([
      {
        id: 'tpl-1',
        name: 'PPL',
        description: 'Push pull legs',
        dayCount: 3,
        existingPlanId: null,
      },
    ]);

    const element = PrebuiltPlansScreen();
    const rowNode = renderFirstTemplateRow(element);
    const text = textContent(rowNode);
    const screenText = textContent(element);

    expect(text).toContain('PPL');
    expect(text).toContain('Push pull legs');
    expect(text).toContain('3 sessions');
    expect(screenText).not.toContain('Import a template to start editing and logging workouts.');
    expect(text).not.toContain('Add to my plans');
    expect(importPrebuiltPlan).not.toHaveBeenCalled();
  });

  it('opens a read-only preview without importing from the template card', () => {
    const navigation: Nav = { navigate: jest.fn() };
    (useNavigation as jest.Mock).mockReturnValue(navigation);
    (listPrebuiltPlans as jest.Mock).mockReturnValue([
      { id: 'tpl-1', name: 'PPL', description: null, dayCount: 3, existingPlanId: null },
    ]);

    const element = PrebuiltPlansScreen();

    const rowNode = renderFirstTemplateRow(element);

    const card = findElementsByType<React.ComponentProps<typeof Pressable>>(
      rowNode,
      Pressable,
    ).find((pressable) => pressable.props.accessibilityLabel === 'Preview PPL');
    card?.props.onPress?.({} as never);

    expect(navigation.navigate).toHaveBeenCalledWith('PrebuiltPlanPreview', {
      templateId: 'tpl-1',
    });
    expect(importPrebuiltPlan).not.toHaveBeenCalled();
  });
});
