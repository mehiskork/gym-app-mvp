jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (styles: unknown) =>
        Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles,
    },
    Platform: { select: () => 'monospace' },
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
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../ui/Text';
import { ExerciseCard } from '../ExerciseCard';
import { SET_NUMBER_COLUMN_WIDTH } from '../setRowLayout';

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

describe('ExerciseCard set headers', () => {
  it('renders set, weight, and reps headers once and keeps SET aligned to the set column', () => {
    const element = ExerciseCard({
      name: 'Deadlift',
      subtitle: '0/1 sets complete',
      onAddSet: jest.fn(),
      children: <Text>Set row</Text>,
    });

    const texts = findElementsByType<{ children?: React.ReactNode; numberOfLines?: number }>(
      element,
      Text,
    );
    const setLabels = texts.filter((text) => text.props.children === 'SET');
    const weightLabels = texts.filter((text) => text.props.children === 'WEIGHT');
    const repLabels = texts.filter((text) => text.props.children === 'REPS');

    const views = findElementsByType<{ children?: React.ReactNode; style?: unknown }>(
      element,
      View,
    );
    const setHeaderColumn = views.find((view) => {
      const style = StyleSheet.flatten(view.props.style) as {
        alignItems?: string;
        flexShrink?: number;
        width?: number;
      };
      const children = React.Children.toArray(view.props.children);
      return (
        style?.width === SET_NUMBER_COLUMN_WIDTH &&
        style.flexShrink === 0 &&
        style.alignItems === 'center' &&
        children.some(
          (child) =>
            React.isValidElement<{ children?: React.ReactNode }>(child) &&
            child.type === Text &&
            child.props.children === 'SET',
        )
      );
    });

    expect(setLabels).toHaveLength(1);
    expect(setLabels[0]?.props.numberOfLines).toBe(1);
    expect(setHeaderColumn).toBeDefined();
    expect(weightLabels).toHaveLength(1);
    expect(repLabels).toHaveLength(1);
  });

  it('disables Add Set and shows the max label when addSetDisabled is true', () => {
    const onAddSet = jest.fn();
    const element = ExerciseCard({
      name: 'Deadlift',
      subtitle: '50/50 sets complete',
      onAddSet,
      addSetDisabled: true,
      children: <Text>Set row</Text>,
    });

    const pressables = findElementsByType<{
      disabled?: boolean;
      onPress?: () => void;
      testID?: string;
    }>(element, Pressable);
    const addSetButton = pressables.find(
      (pressable) => pressable.props.testID === 'exercise-card-add-set',
    );
    const texts = findElementsByType<{ children?: React.ReactNode }>(element, Text);

    expect(addSetButton?.props.disabled).toBe(true);
    expect(texts.some((text) => text.props.children === 'Max 50 sets')).toBe(true);
    expect(onAddSet).not.toHaveBeenCalled();
  });
});
