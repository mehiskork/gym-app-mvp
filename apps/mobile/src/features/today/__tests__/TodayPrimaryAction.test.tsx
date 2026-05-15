jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: any }) => {
      const renderedChildren =
        typeof children === 'function' ? children({ pressed: false }) : children;
      return React.createElement('Pressable', props, renderedChildren);
    },
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../../theme/theme', () => ({
  useAppTheme: () => ({
    colors: {
      primary: '#2563eb',
      primaryBorder: 'rgba(37, 99, 235, 1)',
      primarySoft: '#dbeafe',
    },
  }),
}));

jest.mock('../../../theme/tokens', () => ({
  tokens: {
    spacing: { xs: 4, sm: 8, md: 12 },
  },
}));

jest.mock('../../../ui', () => {
  const React = require('react');
  return {
    Button: ({ title, ...props }: { title: string }) =>
      React.createElement('Button', { title, ...props }),
    Card: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Card', props, children),
    IconChip: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('IconChip', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

import React from 'react';

import { TodayPrimaryAction } from '../TodayPrimaryAction';

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
    return findElements(element.props?.children, predicate, acc);
  }
  return acc;
}

function expandTree(node: React.ReactNode): React.ReactNode {
  if (!node || typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(expandTree);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') {
    return expandTree((node.type as (props: any) => React.ReactNode)(node.props));
  }
  const props = node.props as { children?: React.ReactNode };
  return React.createElement(node.type, props as any, expandTree(props.children));
}

function textContent(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) {
    return textContent((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

function buttons(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'Button');
}

function pressables(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'Pressable');
}

describe('TodayPrimaryAction', () => {
  it('renders quick start card and secondary plan actions when there are no plans', () => {
    const onQuickStart = jest.fn();
    const element = expandTree(
      TodayPrimaryAction({
        hasActiveWorkout: false,
        hasPlans: false,
        onQuickStart,
        onCreatePlan: jest.fn(),
        onBrowsePlans: jest.fn(),
      }),
    );

    const text = textContent(element);
    const actionButtons = buttons(element);

    expect(text).toContain('Start Training');
    expect(text).toContain('Add exercises as you go.');
    expect(text).not.toContain('No plan yet');
    expect(actionButtons.map((button) => button.props.title)).toEqual([
      'Build a plan',
      'Browse plans',
    ]);

    pressables(element)[0]?.props.onPress();
    expect(onQuickStart).toHaveBeenCalledTimes(1);
  });

  it('keeps plan-based start card behavior unchanged when plans exist', () => {
    const onStart = jest.fn();
    const element = expandTree(
      TodayPrimaryAction({
        hasActiveWorkout: false,
        hasPlans: true,
        onStart,
      }),
    );

    const text = textContent(element);
    expect(text).toContain('Start Training');
    expect(text).toContain("Pick today's plan and go.");

    pressables(element)[0]?.props.onPress();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('keeps active-session branch unchanged', () => {
    const onResume = jest.fn();
    const element = expandTree(
      TodayPrimaryAction({
        hasActiveWorkout: true,
        activeWorkoutTitle: 'Leg Day',
        hasPlans: false,
        onResume,
      }),
    );

    const text = textContent(element);
    const resumeButton = buttons(element).find((button) => button.props.title === 'Resume');

    expect(text).toContain('Active Session');
    expect(text).toContain('Leg Day');
    resumeButton?.props.onPress();
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
