import React from 'react';
import { Pressable } from 'react-native';

import { Snackbar } from '../Snackbar';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: { create: (styles: unknown) => styles },
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

jest.mock('../Text', () => {
  const React = require('react');
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

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

function textContent(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) {
    return textContent((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

describe('Snackbar', () => {
  it('renders a message', () => {
    const element = Snackbar({ visible: true, message: 'Copied to clipboard.' });

    expect(textContent(element)).toContain('Copied to clipboard.');
    expect(element?.props.accessibilityRole).toBe('alert');
  });

  it('can be dismissed', () => {
    const onDismiss = jest.fn();
    const element = Snackbar({
      visible: true,
      message: 'Done.',
      onDismiss,
    });

    const dismiss = findElements(
      element,
      (node) => node.type === Pressable && node.props.accessibilityLabel === 'Dismiss message',
    )[0];
    dismiss.props.onPress();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
