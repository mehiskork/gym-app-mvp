jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useEffect: jest.fn(),
    useState: jest.fn(),
    useCallback: (fn: unknown) => fn,
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

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../ui', () => {
  const React = require('react');
  return {
    Badge: (props: unknown) => React.createElement('Badge', props),
    BottomSheetModal: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('BottomSheetModal', props, children),
    Button: ({ title, ...props }: { title: string }) =>
      React.createElement('Button', { title, ...props }),
    Card: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Card', props, children),
    IconChip: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('IconChip', props, children),
    ListRow: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ListRow', props, children),
    Screen: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Screen', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    ToggleRow: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ToggleRow', props, children),
  };
});

jest.mock('../../theme/tokens', () => ({
  tokens: {
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
    radius: { md: 8, lg: 12 },
  },
}));

jest.mock('../../theme/primaryColors', () => ({
  PRIMARY_COLOR_OPTIONS: [
    {
      key: 'blue',
      label: 'Blue',
      primary: '#0000ff',
      primaryBorder: '#0000ff',
      primaryTextOnColor: '#ffffff',
    },
  ],
}));

jest.mock('../../theme/theme', () => ({
  useAppTheme: () => ({
    colors: {
      border: '#ddd',
      danger: '#c00',
      mutedText: '#666',
      primary: '#06f',
      primarySoft: 'rgba(0, 0, 255, 0.2)',
      surface: '#fff',
      surface2: '#f5f5f5',
      text: '#111',
      textSecondary: '#333',
    },
    primaryColorKey: 'blue',
    setPrimaryColorKey: jest.fn(),
  }),
}));

jest.mock('../../components/VersionTapUnlock', () => {
  const React = require('react');
  return {
    VersionTapUnlock: (props: unknown) => React.createElement('VersionTapUnlock', props),
  };
});

jest.mock('../../utils/debugUnlock', () => ({
  isDebugUnlocked: jest.fn(() => Promise.resolve(false)),
  setDebugUnlocked: jest.fn(),
}));

jest.mock('../../utils/format', () => ({
  formatRestCountdown: jest.fn(() => '1:00'),
}));

jest.mock('../../db/settingsRepo', () => ({
  getSettings: jest.fn(() => ({
    autoStartRestTimer: false,
    defaultRestSeconds: 60,
    keepScreenOn: false,
    primaryColorKey: 'blue',
    restTimerNotifications: false,
    restTimerVibration: false,
  })),
  updateSettings: jest.fn((patch: object) => ({
    autoStartRestTimer: false,
    defaultRestSeconds: 60,
    keepScreenOn: false,
    primaryColorKey: 'blue',
    restTimerNotifications: false,
    restTimerVibration: false,
    ...patch,
  })),
}));

jest.mock('../../utils/restTimerNotifications', () => ({
  cancelRestTimerNotification: jest.fn(() => Promise.resolve()),
  ensureRestTimerNotificationChannel: jest.fn(() => Promise.resolve()),
  requestRestTimerNotificationPermission: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../../auth/identityTransition', () => ({
  resetToGuestBootstrap: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../auth/googleAccountOrchestrator', () => ({
  createGoogleAccountFromGuest: jest.fn(() => Promise.resolve()),
  reconnectGoogleAccount: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../auth/firebaseGoogleAuthClient', () => ({
  signOutFromGoogle: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../auth/localAccountState', () => ({
  resolveLocalAccountState: jest.fn(() =>
    Promise.resolve({ status: 'guest', accountSession: null }),
  ),
}));

import React from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { resetToGuestBootstrap } from '../../auth/identityTransition';
import {
  createGoogleAccountFromGuest,
  reconnectGoogleAccount,
} from '../../auth/googleAccountOrchestrator';
import { resolveLocalAccountState } from '../../auth/localAccountState';
import { Button } from '../../ui';
import { SettingsScreen } from '../SettingsScreen';
import { getSettingsAccountUiState } from '../settingsAccountUiState';

describe('Settings account UI state', () => {
  it('shows account creation only for true guest mode', () => {
    expect(getSettingsAccountUiState('guest', null)).toEqual({
      accountLabel: 'Guest',
      showGuestCreate: true,
      showAccountActions: false,
      showReauthRequired: false,
      showReconnect: false,
      reauthMessage: null,
    });
  });

  it('shows signed-in state for linked account mode', () => {
    expect(
      getSettingsAccountUiState('linked_with_usable_account', {
        accessToken: 'account-jwt',
        email: 'user@example.test',
      }),
    ).toEqual({
      accountLabel: 'user@example.test',
      showGuestCreate: false,
      showAccountActions: true,
      showReauthRequired: false,
      showReconnect: false,
      reauthMessage: null,
    });
  });

  it('does not expose guest account creation when linked state needs reauth', () => {
    expect(getSettingsAccountUiState('linked_reauth_required', null)).toEqual({
      accountLabel: 'Account session expired',
      showGuestCreate: false,
      showAccountActions: false,
      showReauthRequired: true,
      showReconnect: true,
      reauthMessage: 'Reconnect with Google to sync this device again.',
    });
  });
});

type StateConfig = {
  accountSession?: unknown;
  accountState: 'guest' | 'linked_with_usable_account' | 'linked_reauth_required';
};

const useStateMock = React.useState as jest.Mock;

function renderSettingsScreen({ accountSession = null, accountState }: StateConfig) {
  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [accountState, jest.fn()])
    .mockImplementationOnce(() => [accountSession, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()]);

  return SettingsScreen();
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

function buttons(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'Button' || element.type === Button);
}

describe('SettingsScreen account interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useFocusEffect as jest.Mock).mockImplementation(jest.fn());
    (resolveLocalAccountState as jest.Mock).mockResolvedValue({
      status: 'linked_reauth_required',
      accountSession: null,
    });
  });

  it('shows reconnect and reset actions instead of guest migration when reauth is required', () => {
    const tree = expandTree(renderSettingsScreen({ accountState: 'linked_reauth_required' }));
    const text = textContent(tree);
    const buttonTitles = buttons(tree).map((button) => button.props.title);

    expect(text).toContain('Account session expired');
    expect(text).toContain('Reconnect with Google to sync this device again.');
    expect(text).not.toMatch(/Account:\s+Guest/);
    expect(text).not.toContain('Create account');
    expect(buttonTitles).toContain('Reconnect with Google');
    expect(buttonTitles).toContain('Reset this device');
    expect(buttonTitles).not.toContain('Continue with Google');
  });

  it('tapping reconnect uses reconnect flow without guest migration or claim navigation', async () => {
    const tree = expandTree(renderSettingsScreen({ accountState: 'linked_reauth_required' }));
    const reconnectButton = buttons(tree).find(
      (button) => button.props.title === 'Reconnect with Google',
    );

    await reconnectButton?.props.onPress();

    expect(reconnectGoogleAccount).toHaveBeenCalledTimes(1);
    expect(createGoogleAccountFromGuest).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringMatching(/claim/i),
      expect.anything(),
    );
    expect(resolveLocalAccountState).toHaveBeenCalled();
  });

  it('surfaces reconnect errors without starting guest migration', async () => {
    (reconnectGoogleAccount as jest.Mock).mockRejectedValueOnce(new Error('Reconnect failed.'));

    const setAccountError = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_reauth_required', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, setAccountError])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const reconnectButton = buttons(tree).find(
      (button) => button.props.title === 'Reconnect with Google',
    );

    await reconnectButton?.props.onPress();

    expect(setAccountError).toHaveBeenCalledWith('Reconnect failed.');
    expect(createGoogleAccountFromGuest).not.toHaveBeenCalled();
  });

  it('tapping reset uses destructive confirmation before clearing local account data', async () => {
    const tree = expandTree(renderSettingsScreen({ accountState: 'linked_reauth_required' }));
    const resetButton = buttons(tree).find((button) => button.props.title === 'Reset this device');

    resetButton?.props.onPress();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Log out and clear local data?',
      expect.any(String),
      expect.any(Array),
    );
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await alertButtons[1].onPress();
    await Promise.resolve();

    expect(resetToGuestBootstrap).toHaveBeenCalledTimes(1);
    expect(reconnectGoogleAccount).not.toHaveBeenCalled();
    expect(createGoogleAccountFromGuest).not.toHaveBeenCalled();
  });

  it('keeps existing guest and linked usable account actions visible in their states', () => {
    const guestTree = expandTree(renderSettingsScreen({ accountState: 'guest' }));
    expect(textContent(guestTree)).toMatch(/Account:\s+Guest/);
    expect(buttons(guestTree).map((button) => button.props.title)).toContain(
      'Continue with Google',
    );

    const linkedTree = expandTree(
      renderSettingsScreen({
        accountState: 'linked_with_usable_account',
        accountSession: { accessToken: 'token', email: 'user@example.test' },
      }),
    );
    const linkedButtonTitles = buttons(linkedTree).map((button) => button.props.title);
    expect(textContent(linkedTree)).toMatch(/Account:\s+user@example\.test/);
    expect(linkedButtonTitles).toContain('Switch account');
    expect(linkedButtonTitles).toContain('Sign out');
    expect(linkedButtonTitles).not.toContain('Continue with Google');
  });
});
