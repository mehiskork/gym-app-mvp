jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useEffect: jest.fn(),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('../../ui/Screen', () => {
  const React = require('react');
  return {
    Screen: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Screen', props, children),
  };
});

jest.mock('../../ui/Text', () => {
  const React = require('react');
  return {
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

jest.mock('../../ui/Button', () => {
  const React = require('react');
  const MockButton = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('MockButton', props, children);
  return { Button: MockButton };
});

jest.mock('../../api/client', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('../../db/appMetaRepo', () => ({
  getClaimed: jest.fn(() => false),
  pauseSync: jest.fn(),
  resumeSync: jest.fn(),
}));

import React from 'react';

import { ClaimStartScreen } from '../ClaimStartScreen';
import { api } from '../../api/client';
import { Button } from '../../ui/Button';
import { getClaimed } from '../../db/appMetaRepo';

type Nav = { goBack: jest.Mock };

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

describe('ClaimStartScreen claim flow', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);

    (api.post as jest.Mock).mockReset();
    (api.post as jest.Mock).mockResolvedValue({
      claimId: 'claim-1',
      code: 'ABC123',
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('uses blessed api client for /claim/start', async () => {
    const navigation: Nav = { goBack: jest.fn() };

    const element = ClaimStartScreen({
      navigation,
      route: { key: 'ClaimStart', name: 'ClaimStart' },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const button = findElementByType<ButtonProps>(element, Button);
    if (button?.props.title !== 'Generate code' || !button.props.onPress) {
      throw new Error('Generate code button onPress should be defined.');
    }

    await button.props.onPress({} as never);

    expect(api.post).toHaveBeenCalledWith('/claim/start');
  });

  it('blocks claim generation when device is already linked', async () => {
    (getClaimed as jest.Mock).mockReturnValue(true);
    const navigation: Nav = { goBack: jest.fn() };

    const element = ClaimStartScreen({
      navigation,
      route: { key: 'ClaimStart', name: 'ClaimStart' },
    } as never);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const button = findElementByType<ButtonProps>(element, Button);
    if (button?.props.title !== 'Generate code' || !button.props.onPress) {
      throw new Error('Generate code button onPress should be defined.');
    }

    await button.props.onPress({} as never);

    expect(api.post).not.toHaveBeenCalled();
  });
});
