jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useEffect: jest.fn(),
    useRef: jest.fn((initial: unknown) => ({ current: initial })),
    useState: jest.fn(),
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn(() => Promise.resolve()) },
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
    BottomSheetModal: ({
      children,
      visible,
      ...props
    }: {
      children?: React.ReactNode;
      visible?: boolean;
    }) => React.createElement('BottomSheetModal', { visible, ...props }, visible ? children : null),
    Button: ({ title, ...props }: { title: string }) =>
      React.createElement('Button', { title, ...props }),
    Card: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Card', props, children),
    DestructiveConfirmDialog: (props: unknown) =>
      React.createElement('DestructiveConfirmDialog', props),
    IconChip: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('IconChip', props, children),
    Input: (props: unknown) => React.createElement('Input', props),
    ListRow: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ListRow', props, children),
    Screen: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Screen', props, children),
    Snackbar: (props: unknown) => React.createElement('Snackbar', props),
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

jest.mock('../../auth/accountDeletion', () => ({
  deleteAccountAndResetLocalState: jest.fn(() => Promise.resolve()),
  getFriendlyAccountDeletionError: jest.fn(
    () => 'Something went wrong. Your local data was not removed.',
  ),
}));

jest.mock('../../api/config', () => ({
  getAccountDeletionUrl: jest.fn(() => 'https://trainframe.example/account-deletion'),
}));

import React from 'react';
import { Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { resetToGuestBootstrap } from '../../auth/identityTransition';
import { signOutFromGoogle } from '../../auth/firebaseGoogleAuthClient';
import {
  createGoogleAccountFromGuest,
  reconnectGoogleAccount,
} from '../../auth/googleAccountOrchestrator';
import { resolveLocalAccountState } from '../../auth/localAccountState';
import { deleteAccountAndResetLocalState } from '../../auth/accountDeletion';
import { getAccountDeletionUrl } from '../../api/config';
import { requestRestTimerNotificationPermission } from '../../utils/restTimerNotifications';
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
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['review', jest.fn()])
    .mockImplementationOnce(() => ['', jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()]);

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

function inputs(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'Input');
}

function destructiveDialogs(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'DestructiveConfirmDialog');
}

function toggleRows(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'ToggleRow');
}

function pressables(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'Pressable');
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
    expect(buttonTitles).toContain('Reconnect with Google');
    expect(buttonTitles).toContain('Reset this device');
    expect(buttonTitles).not.toContain('Sign in with Google');
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

  it('surfaces friendly reconnect errors without starting guest migration', async () => {
    (reconnectGoogleAccount as jest.Mock).mockRejectedValueOnce(
      new Error('Firebase token exchange failed.'),
    );

    const setAccountError = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_reauth_required', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, setAccountError])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const reconnectButton = buttons(tree).find(
      (button) => button.props.title === 'Reconnect with Google',
    );

    await reconnectButton?.props.onPress();

    expect(setAccountError).toHaveBeenCalledWith(
      "Couldn't reconnect this Google account. Check your connection and try again.",
    );
    expect(createGoogleAccountFromGuest).not.toHaveBeenCalled();
  });

  it('maps wrong-account account errors to destructive reset guidance', async () => {
    (reconnectGoogleAccount as jest.Mock).mockRejectedValueOnce(
      new Error(
        'Different account detected. Sign out and reset local data before switching accounts.',
      ),
    );

    const setAccountError = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_reauth_required', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, setAccountError])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const reconnectButton = buttons(tree).find(
      (button) => button.props.title === 'Reconnect with Google',
    );

    await reconnectButton?.props.onPress();

    expect(setAccountError).toHaveBeenCalledWith(
      'This device is linked to a different Google account. Reset this device before switching accounts.',
    );
  });

  it('shows an inline notification permission denial instead of a native alert', async () => {
    (requestRestTimerNotificationPermission as jest.Mock).mockResolvedValueOnce(false);
    const setRestNotificationMessage = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['guest', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, setRestNotificationMessage]);

    const tree = expandTree(SettingsScreen());
    const restNotificationsToggle = toggleRows(tree).find(
      (row) => row.props.title === 'Rest notifications',
    );

    await restNotificationsToggle?.props.onValueChange(true);

    expect(Alert.alert).not.toHaveBeenCalledWith('Notifications disabled', expect.any(String));
    expect(setRestNotificationMessage).toHaveBeenLastCalledWith(
      'Notifications are off. Enable TrainFrame notifications in Android Settings to get rest timer alerts.',
    );
  });

  it('tapping reset opens app-owned confirmation before clearing local account data', () => {
    const setLogoutConfirmOpen = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_reauth_required', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, setLogoutConfirmOpen])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const resetButton = buttons(tree).find((button) => button.props.title === 'Reset this device');

    resetButton?.props.onPress();

    expect(setLogoutConfirmOpen).toHaveBeenCalledWith(true);
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Log out and clear local data?',
      expect.any(String),
      expect.any(Array),
    );
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
  });

  it('tapping sign out opens app-owned confirmation instead of a native alert', () => {
    const setLogoutConfirmOpen = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_with_usable_account', jest.fn()])
      .mockImplementationOnce(() => [
        { accessToken: 'token', email: 'user@example.test' },
        jest.fn(),
      ])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, setLogoutConfirmOpen])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const signOutButton = buttons(tree).find((button) => button.props.title === 'Sign out');

    signOutButton?.props.onPress();

    expect(setLogoutConfirmOpen).toHaveBeenCalledWith(true);
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'Log out and clear local data?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('canceling sign-out confirmation leaves local account data intact', () => {
    const setLogoutConfirmOpen = jest.fn();
    const tree = expandTree(renderLogoutConfirmState(setLogoutConfirmOpen));
    const dialog = destructiveDialogs(tree)[0];

    expect(dialog?.props.title).toBe('Log out and clear local data?');
    expect(dialog?.props.body).toBe(
      'This device will sign out and remove local synced data so another account cannot inherit it.',
    );
    expect(dialog?.props.cancelLabel).toBe('Cancel');
    expect(dialog?.props.confirmLabel).toBe('Log out');

    dialog?.props.onClose();

    expect(setLogoutConfirmOpen).toHaveBeenCalledWith(false);
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
    expect(signOutFromGoogle).not.toHaveBeenCalled();
  });

  it('confirming sign-out uses the existing sign-out and local clear path', async () => {
    const tree = expandTree(renderLogoutConfirmState());
    const dialog = destructiveDialogs(tree)[0];

    dialog?.props.onConfirm();
    await Promise.resolve();
    await Promise.resolve();

    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledTimes(1);
    expect(reconnectGoogleAccount).not.toHaveBeenCalled();
    expect(createGoogleAccountFromGuest).not.toHaveBeenCalled();
  });

  it('ignores a second immediate sign-out confirmation submit', async () => {
    const tree = expandTree(renderLogoutConfirmState());
    const dialog = destructiveDialogs(tree)[0];

    dialog?.props.onConfirm();
    dialog?.props.onConfirm();
    await Promise.resolve();
    await Promise.resolve();

    expect(signOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).toHaveBeenCalledTimes(1);
  });

  it('keeps existing guest and linked usable account actions visible in their states', () => {
    const guestTree = expandTree(renderSettingsScreen({ accountState: 'guest' }));
    const guestText = textContent(guestTree);
    expect(guestText).toContain('Using guest mode');
    expect(guestText).toContain(
      'Your workout data is saved on this device. Sign in with Google to sync it and keep it safe if you change phones.',
    );
    expect(buttons(guestTree).map((button) => button.props.title)).toContain('Sign in with Google');

    const linkedTree = expandTree(
      renderSettingsScreen({
        accountState: 'linked_with_usable_account',
        accountSession: { accessToken: 'token', email: 'user@example.test' },
      }),
    );
    const linkedButtonTitles = buttons(linkedTree).map((button) => button.props.title);
    expect(textContent(linkedTree)).toContain('Signed in as user@example.test');
    expect(textContent(linkedTree)).not.toContain('Account: user@example.test');
    expect(linkedButtonTitles).toContain('Switch account');
    expect(linkedButtonTitles).toContain('Sign out');
    expect(linkedButtonTitles).toContain('Delete account');
    expect(linkedButtonTitles).not.toContain('Sign in with Google');
  });

  it('uses the existing guest-to-account migration flow from guest Settings sign-in', async () => {
    const guestTree = expandTree(renderSettingsScreen({ accountState: 'guest' }));
    const signInButton = buttons(guestTree).find(
      (button) => button.props.title === 'Sign in with Google',
    );

    await signInButton?.props.onPress();

    expect(createGoogleAccountFromGuest).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
  });

  it('does not show Delete account for guest mode', () => {
    const guestTree = expandTree(renderSettingsScreen({ accountState: 'guest' }));

    expect(buttons(guestTree).map((button) => button.props.title)).not.toContain('Delete account');
  });

  it('shows account deletion web request link for guest users and opens configured URL', () => {
    const guestTree = expandTree(renderSettingsScreen({ accountState: 'guest' }));
    const link = pressables(guestTree).find((pressable) =>
      textContent(pressable).includes('Account deletion request'),
    );

    expect(link).toBeDefined();
    link?.props.onPress();

    expect(getAccountDeletionUrl).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith('https://trainframe.example/account-deletion');
  });

  it('shows friendly feedback if the account deletion web link cannot open', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(
      new Error('raw backend token failed to open'),
    );
    const setAccountDeletionLinkError = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['guest', jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['review', jest.fn()])
      .mockImplementationOnce(() => ['', jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, setAccountDeletionLinkError])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const guestTree = expandTree(SettingsScreen());
    const link = pressables(guestTree).find((pressable) =>
      textContent(pressable).includes('Account deletion request'),
    );

    link?.props.onPress();
    await Promise.resolve();

    expect(setAccountDeletionLinkError).toHaveBeenCalledWith(
      'Could not open the account deletion page. Try again later.',
    );

    const feedbackTree = expandTree(renderAccountDeletionLinkErrorState());
    const snackbars = findElements(feedbackTree, (element) => element.type === 'Snackbar');
    expect(snackbars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            message: 'Could not open the account deletion page. Try again later.',
          }),
        }),
      ]),
    );
    expect(textContent(feedbackTree)).not.toContain('raw backend token');
  });

  it('opens destructive delete account confirmation for account users', () => {
    const setDeleteAccountOpen = jest.fn();
    const setDeleteAccountStep = jest.fn();
    const setDeleteAccountConfirmText = jest.fn();
    useStateMock.mockReset();
    useStateMock
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => ['linked_with_usable_account', jest.fn()])
      .mockImplementationOnce(() => [
        { accessToken: 'token', email: 'user@example.test' },
        jest.fn(),
      ])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [false, setDeleteAccountOpen])
      .mockImplementationOnce(() => ['review', setDeleteAccountStep])
      .mockImplementationOnce(() => ['', setDeleteAccountConfirmText])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()]);

    const tree = expandTree(SettingsScreen());
    const deleteButton = buttons(tree).find((button) => button.props.title === 'Delete account');

    deleteButton?.props.onPress();

    expect(setDeleteAccountStep).toHaveBeenCalledWith('review');
    expect(setDeleteAccountConfirmText).toHaveBeenCalledWith('');
    expect(setDeleteAccountOpen).toHaveBeenCalledWith(true);
  });

  it('requires typing DELETE before final account deletion', () => {
    const tree = expandTree(
      renderDeleteAccountState({
        confirmText: 'DEL',
      }),
    );
    const finalDeleteButton = buttons(tree)
      .reverse()
      .find((button) => button.props.title === 'Delete account');

    expect(finalDeleteButton?.props.disabled).toBe(true);
    expect(inputs(tree)[0]?.props.value).toBe('DEL');
  });

  it('calls account deletion coordinator from final confirmation and prevents double submit', async () => {
    const tree = expandTree(
      renderDeleteAccountState({
        confirmText: 'DELETE',
      }),
    );
    const finalDeleteButton = buttons(tree)
      .reverse()
      .find((button) => button.props.title === 'Delete account');

    expect(finalDeleteButton?.props.disabled).toBe(false);
    await finalDeleteButton?.props.onPress();

    expect(deleteAccountAndResetLocalState).toHaveBeenCalledTimes(1);
  });
});

function renderDeleteAccountState({ confirmText }: { confirmText: string }) {
  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['linked_with_usable_account', jest.fn()])
    .mockImplementationOnce(() => [{ accessToken: 'token', email: 'user@example.test' }, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce(() => [true, jest.fn()])
    .mockImplementationOnce(() => ['confirm', jest.fn()])
    .mockImplementationOnce(() => [confirmText, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()]);

  return SettingsScreen();
}

function renderLogoutConfirmState(setLogoutConfirmOpen = jest.fn()) {
  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['linked_with_usable_account', jest.fn()])
    .mockImplementationOnce(() => [{ accessToken: 'token', email: 'user@example.test' }, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['review', jest.fn()])
    .mockImplementationOnce(() => ['', jest.fn()])
    .mockImplementationOnce(() => [true, setLogoutConfirmOpen])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()]);

  return SettingsScreen();
}

function renderAccountDeletionLinkErrorState() {
  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['guest', jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => ['review', jest.fn()])
    .mockImplementationOnce(() => ['', jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [
      'Could not open the account deletion page. Try again later.',
      jest.fn(),
    ])
    .mockImplementationOnce((initial: unknown) => [initial, jest.fn()])
    .mockImplementationOnce(() => [false, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()]);

  return SettingsScreen();
}
