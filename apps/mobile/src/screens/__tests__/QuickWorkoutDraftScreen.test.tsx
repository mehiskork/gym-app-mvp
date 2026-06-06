jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useCallback: (fn: () => unknown) => fn,
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../theme/theme', () => ({
  useAppTheme: () => ({ colors: { primary: '#2563eb' } }),
}));

jest.mock('../../theme/tokens', () => ({
  tokens: {
    spacing: { sm: 8, lg: 16 },
  },
}));

jest.mock('../../ui', () => {
  const React = require('react');
  return {
    Button: ({ title, ...props }: { title: string }) =>
      React.createElement('Button', { title, ...props }),
    Card: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Card', props, children),
    EmptyState: ({ icon, title, description, action }: any) =>
      React.createElement('EmptyState', { title, description }, icon, action),
    Screen: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Screen', props, children),
  };
});

import React from 'react';

import { QuickWorkoutDraftScreen } from '../QuickWorkoutDraftScreen';

function findElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<any>) => boolean,
  acc: Array<React.ReactElement<any>> = [],
): Array<React.ReactElement<any>> {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, predicate, acc));
    return acc;
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<any>;
    if (predicate(element)) acc.push(element);
    findElements(element.props?.action, predicate, acc);
    return findElements(element.props?.children, predicate, acc);
  }
  return acc;
}

function textContent(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) {
    const props = node.props as {
      children?: React.ReactNode;
      title?: string;
      description?: string;
    };
    return [props.title, props.description, textContent(props.children)].filter(Boolean).join(' ');
  }
  return '';
}

describe('QuickWorkoutDraftScreen', () => {
  it('renders only the minimal draft controls and opens ExercisePicker in draft mode', () => {
    const navigation = { navigate: jest.fn() };
    const element = QuickWorkoutDraftScreen({
      navigation,
      route: { key: 'QuickWorkoutDraft', name: 'QuickWorkoutDraft', params: undefined },
    } as never);

    const text = textContent(element);
    expect(text).toContain('Quick Workout');
    expect(text).toContain('Add your first exercise to start this workout.');
    expect(text).not.toContain('Finish workout');
    expect(text).not.toContain('Add Set');
    expect(text).not.toContain('Add Note');

    const buttons = findElements(element, (node) => node.props?.title === 'Add Exercise');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.title).toBe('Add Exercise');

    buttons[0].props.onPress();
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', { quickWorkoutDraft: true });
  });
});
