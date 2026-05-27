jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useRef: jest.fn((initial: unknown) => ({ current: initial })),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
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
    colors: { textSecondary: '#666666' },
  },
}));

jest.mock('../../utils/debugUnlock', () => ({
  setDebugUnlocked: jest.fn(() => Promise.resolve()),
}));

import React from 'react';

import { setDebugUnlocked } from '../../utils/debugUnlock';
import { VersionTapUnlock } from '../VersionTapUnlock';

function renderVersionTapUnlock(enabled: boolean, onUnlocked = jest.fn()) {
  return VersionTapUnlock({ enabled, onUnlocked });
}

describe('VersionTapUnlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not unlock Debug after repeated taps when disabled', async () => {
    const onUnlocked = jest.fn();
    const element = renderVersionTapUnlock(false, onUnlocked) as React.ReactElement<any>;

    for (let index = 0; index < 7; index += 1) {
      await element.props.onPress();
    }

    expect(setDebugUnlocked).not.toHaveBeenCalled();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('unlocks Debug after seven taps when enabled', async () => {
    const onUnlocked = jest.fn();
    const element = renderVersionTapUnlock(true, onUnlocked) as React.ReactElement<any>;

    for (let index = 0; index < 7; index += 1) {
      await element.props.onPress();
    }

    expect(setDebugUnlocked).toHaveBeenCalledWith(true);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });
});
