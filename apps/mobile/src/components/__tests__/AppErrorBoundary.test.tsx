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

jest.mock('../../ui/Text', () => {
  const React = require('react');
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

jest.mock('../../theme/tokens', () => ({
  tokens: {
    radius: { md: 8 },
    spacing: { sm: 8, lg: 16, xl: 24 },
  },
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

import React from 'react';

import { logEvent } from '../../utils/logger';
import { AppErrorBoundary } from '../AppErrorBoundary';

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

function makeBoundary(children: React.ReactNode) {
  const boundary = new AppErrorBoundary({ children });
  boundary.setState = (update: any) => {
    const nextState =
      typeof update === 'function' ? update(boundary.state, boundary.props) : update;
    boundary.state = { ...boundary.state, ...nextState };
  };
  return boundary;
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = true;
  });

  it('shows friendly fallback and logs when a render error is caught', () => {
    const boundary = makeBoundary('Recovered');
    const error = new Error('Raw render stack detail');
    const errorInfo = { componentStack: '\n    in BrokenScreen' };

    boundary.state = {
      ...boundary.state,
      ...AppErrorBoundary.getDerivedStateFromError(error),
    };
    boundary.componentDidCatch(error, errorInfo);

    const tree = expandTree(boundary.render());
    const text = textContent(tree);

    expect(text).toContain('Something went wrong');
    expect(text).toContain('TrainFrame hit a problem on this screen. Try restarting the app.');
    expect(logEvent).toHaveBeenCalledWith('error', 'ui', 'React render error caught', {
      message: 'Raw render stack detail',
      componentStack: '\n    in BrokenScreen',
    });
  });

  it('try again resets the boundary and renders children again', () => {
    const boundary = makeBoundary('Recovered');
    boundary.state = {
      error: new Error('temporary render error'),
      errorInfo: { componentStack: '\n    in BrokenScreen' },
    };

    const fallback = expandTree(boundary.render());
    const tryAgain = findElements(fallback, (element) => element.type === 'Pressable')[0];
    tryAgain.props.onPress();

    expect(boundary.state.error).toBeNull();
    expect(boundary.state.errorInfo).toBeNull();
    expect(boundary.render()).toBe('Recovered');
  });

  it('production fallback does not expose raw error details', () => {
    (global as any).__DEV__ = false;
    const boundary = makeBoundary('Recovered');
    boundary.state = {
      error: new Error('database stack secret detail'),
      errorInfo: { componentStack: '\n    in SecretScreen' },
    };

    const tree = expandTree(boundary.render());
    const text = textContent(tree);

    expect(text).toContain('Something went wrong');
    expect(text).not.toContain('database stack secret detail');
    expect(text).not.toContain('SecretScreen');
  });
});
