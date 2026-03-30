jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(() => [true, jest.fn()]),
  };
});

jest.mock('../../theme/theme', () => ({
  useAppTheme: jest.fn(() => ({
    colors: {
      primary: '#3366FF',
    },
  })),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    TextInput: ({ ...props }) => React.createElement('TextInput', props),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

import React from 'react';
import { Input } from '../Input';

describe('Input', () => {
  it('uses theme primary color for focused border styling', () => {
    const element = Input({ value: 'Plan A' } as never);

    expect(JSON.stringify(element)).toContain('\"borderColor\":\"#3366FF\"');
  });
});
