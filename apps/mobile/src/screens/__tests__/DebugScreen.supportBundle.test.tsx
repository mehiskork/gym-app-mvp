jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useState: jest.fn(),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Alert: { alert: jest.fn() },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  channel: 'preview',
  isEnabled: true,
  runtimeVersion: '1.0.0',
  updateId: 'update-1',
}));

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8' },
  cacheDirectory: null,
  documentDirectory: null,
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../app.json', () => ({
  expo: {
    android: { versionCode: 1 },
    name: 'TrainFrame',
    version: '1.0.0',
  },
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

jest.mock('../../ui/DestructiveConfirmDialog', () => {
  const React = require('react');
  return {
    DestructiveConfirmDialog: (props: unknown) =>
      React.createElement('DestructiveConfirmDialog', props),
  };
});

jest.mock('../../theme/tokens', () => ({
  tokens: {
    colors: {
      border: '#ddd',
      surface: '#fff',
    },
    radius: { lg: 12, md: 8 },
    spacing: { sm: 8, md: 12, lg: 16, xl: 24 },
  },
}));

jest.mock('../../utils/json', () => ({
  safeJsonParse: jest.fn(() => ({})),
}));

jest.mock('../../db/debugRepo', () => ({
  clearOutboxForDebug: jest.fn(),
  getInProgressWorkout: jest.fn(() => null),
  getSupportBundle: jest.fn(() => ({ exportedAt: 'now', syncState: {}, auth: {} })),
  getSyncDebugInfo: jest.fn(() => null),
  getTableCounts: jest.fn(() => ({})),
  getWeekStartDebugInfo: jest.fn(() => null),
  getWorkoutSessionExerciseSchemaHealth: jest.fn(() => null),
  repairSessionsMissingSets: jest.fn(() => 0),
  repairStaleInFlightOpsForDebug: jest.fn(() => 0),
  resetInProgressWorkoutHardDelete: jest.fn(),
  resetSyncCursorForDebug: jest.fn(),
  testNestedTransactionRollback: jest.fn(() => ({ ok: true, message: 'ok' })),
  validateStatusEnums: jest.fn(() => ({ ok: true, message: 'ok' })),
  verifySyncState: jest.fn(() => null),
}));

jest.mock('../../db/syncRunRepo', () => ({
  listSyncRuns: jest.fn(() => []),
}));

jest.mock('../../db/db', () => ({
  query: jest.fn(() => []),
}));

jest.mock('../../db/historyRepo', () => ({
  deleteAllCompletedSessions: jest.fn(),
}));

jest.mock('../../db/seed/seedTestPlan', () => ({
  seedTestPlan: jest.fn(),
}));

jest.mock('../../api/config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://gym-app-mvp-production.up.railway.app'),
}));

jest.mock('../../sync/syncWorker', () => ({
  registerDeviceIfNeeded: jest.fn(() => Promise.resolve()),
  syncNow: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../sync/constants', () => ({
  OUTBOX_STALE_IN_FLIGHT_SECONDS: 120,
}));

jest.mock('../../utils/timestamp', () => ({
  formatTimestampForDisplay: jest.fn((value?: string | null) => value ?? '—'),
}));

jest.mock('../../utils/logger', () => ({
  sanitizeLogContext: jest.fn((value: unknown) => value),
}));

import React from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

import { DebugScreen } from '../Debug/DebugScreen';

const useStateMock = React.useState as jest.Mock;

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

describe('DebugScreen support bundle export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
  });

  it('opens a privacy confirmation before exporting the support bundle', () => {
    const setSupportBundleConfirmVisible = jest.fn();
    useStateMock
      .mockImplementationOnce(() => [{}, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [[], jest.fn()])
      .mockImplementationOnce(() => [false, setSupportBundleConfirmVisible]);

    const element = expandTree(DebugScreen());
    const exportButton = findElements(
      element,
      (node) => node.type === 'Pressable' && textContent(node).includes('Export support bundle'),
    )[0];

    exportButton.props.onPress();

    expect(setSupportBundleConfirmVisible).toHaveBeenCalledWith(true);
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('exports the support bundle only after confirmation', async () => {
    const setSupportBundleConfirmVisible = jest.fn();
    useStateMock
      .mockImplementationOnce(() => [{}, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [null, jest.fn()])
      .mockImplementationOnce(() => [[], jest.fn()])
      .mockImplementationOnce(() => [true, setSupportBundleConfirmVisible]);

    const element = expandTree(DebugScreen());
    const dialog = findElements(element, (node) => node.type === 'DestructiveConfirmDialog')[0];

    expect(dialog.props.title).toBe('Share support bundle?');
    expect(dialog.props.body).toBe(
      'Support bundle includes diagnostic IDs, sync status, and local counts, but not passwords or raw auth tokens. Share it only with TrainFrame support.',
    );

    await dialog.props.onConfirm();

    expect(setSupportBundleConfirmVisible).toHaveBeenCalledWith(false);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('exportedAt'));
  });
});
