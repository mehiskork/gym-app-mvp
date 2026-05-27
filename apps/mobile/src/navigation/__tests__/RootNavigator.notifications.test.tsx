let mockEffectCleanup: (() => void) | undefined;
let mockIsDebugScreenEnabled = true;

jest.mock('react-native-gesture-handler', () => ({}));

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useEffect: jest.fn((cb: () => void | (() => void)) => {
      const cleanup = cb();
      mockEffectCleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }),
    useRef: jest.fn((initial: unknown) => ({ current: initial })),
  };
});

const mockNavigate = jest.fn();
let mockNavigationReady = false;
let mockCapturedOnReady: (() => void) | undefined;
const mockStackScreens: Array<{ name?: string; options?: { title?: string } }> = [];

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({
      children,
      onReady,
    }: {
      children?: React.ReactNode;
      onReady?: () => void;
    }) => {
      mockCapturedOnReady = onReady;
      return React.createElement('NavigationContainer', { onReady }, children);
    },
    useNavigationContainerRef: () => ({
      isReady: () => mockNavigationReady,
      navigate: mockNavigate,
    }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement('Navigator', props, children),
      Screen: (props: { name?: string; options?: { title?: string } }) => {
        mockStackScreens.push(props);
        return React.createElement('Screen', props);
      },
    }),
  };
});

const mockAddNotificationResponseReceivedListener = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn();
const mockRemoveNotificationListener = jest.fn();
let mockNotificationListener:
  | ((response: import('expo-notifications').NotificationResponse) => void)
  | undefined;

jest.mock(
  'expo-notifications',
  () => ({
    addNotificationResponseReceivedListener: jest.fn((listener) => {
      mockNotificationListener = listener;
      mockAddNotificationResponseReceivedListener(listener);
      return { remove: mockRemoveNotificationListener };
    }),
    getLastNotificationResponseAsync: jest.fn(() => mockGetLastNotificationResponseAsync()),
  }),
  { virtual: true },
);

jest.mock('../MainTabs', () => ({
  MainTabs: () => 'MainTabs',
}));

jest.mock('../../screens/WorkoutSessionScreen', () => ({
  WorkoutSessionScreen: () => 'WorkoutSessionScreen',
}));

jest.mock('../../screens/CreateExerciseScreen', () => ({
  CreateExerciseScreen: () => 'CreateExerciseScreen',
}));

jest.mock('../../screens/WorkoutPlanDetailScreen', () => ({
  WorkoutPlanDetailScreen: () => 'WorkoutPlanDetailScreen',
}));

jest.mock('../../screens/DayDetailScreen', () => ({
  DayDetailScreen: () => 'DayDetailScreen',
}));

jest.mock('../../screens/ExercisePickerScreen', () => ({
  ExercisePickerScreen: () => 'ExercisePickerScreen',
}));

jest.mock('../../screens/StartWorkoutScreen', () => ({
  StartWorkoutScreen: () => 'StartWorkoutScreen',
}));

jest.mock('../../screens/SessionDetailScreen', () => ({
  SessionDetailScreen: () => 'SessionDetailScreen',
}));

jest.mock('../../screens/ExerciseDetailScreen', () => ({
  ExerciseDetailScreen: () => 'ExerciseDetailScreen',
}));

jest.mock('../../screens/Debug/DebugScreen', () => ({
  DebugScreen: () => 'DebugScreen',
}));

jest.mock('../../screens/PrebuiltPlansScreen', () => ({
  PrebuiltPlansScreen: () => 'PrebuiltPlansScreen',
}));

jest.mock('../../screens/PrebuiltPlanPreviewScreen', () => ({
  PrebuiltPlanPreviewScreen: () => 'PrebuiltPlanPreviewScreen',
}));

jest.mock('../../screens/ClaimStartScreen', () => ({
  ClaimStartScreen: () => 'ClaimStartScreen',
}));

jest.mock('../../theme/tokens', () => ({
  tokens: {
    colors: { bg: '#000000', text: '#ffffff' },
  },
}));

jest.mock('../../db/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  get isDebugScreenEnabled() {
    return mockIsDebugScreenEnabled;
  },
}));

import React from 'react';
import type * as Notifications from 'expo-notifications';

import { query } from '../../db/db';
import { RootNavigator } from '../RootNavigator';
import { UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE } from '../../utils/unfinishedWorkoutReminderNotifications';

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function notificationResponse(
  type: string | undefined,
  sessionId = 'ws-1',
): Notifications.NotificationResponse {
  return {
    actionIdentifier: 'default',
    notification: {
      date: Date.now(),
      request: {
        identifier: `notification-${sessionId}-${type ?? 'none'}`,
        content: {
          title: null,
          subtitle: null,
          body: null,
          data: type ? { type, sessionId } : { sessionId },
          sound: null,
        },
        trigger: null,
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

function renderRootNavigator() {
  function expand(node: React.ReactNode): void {
    if (!node || typeof node === 'string' || typeof node === 'number') return;
    if (Array.isArray(node)) {
      node.forEach(expand);
      return;
    }
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'function') {
      expand((node.type as (props: any) => React.ReactNode)(node.props));
      return;
    }
    expand((node.props as { children?: React.ReactNode }).children);
  }

  expand(RootNavigator());
}

describe('RootNavigator unfinished workout notification handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedOnReady = undefined;
    mockEffectCleanup = undefined;
    mockNavigationReady = false;
    mockIsDebugScreenEnabled = true;
    mockStackScreens.length = 0;
    mockNotificationListener = undefined;
    mockGetLastNotificationResponseAsync.mockResolvedValue(null);
    (query as jest.Mock).mockReturnValue([{ id: 'ws-1' }]);
  });

  it('queues a cold-start unfinished workout notification until navigation is ready', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(
      notificationResponse(UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE),
    );

    renderRootNavigator();
    await flushPromises();

    expect(mockNavigate).not.toHaveBeenCalled();

    mockNavigationReady = true;
    mockCapturedOnReady?.();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM workout_session'), [
      'ws-1',
      'in_progress',
    ]);
    expect(mockNavigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'ws-1' });
  });

  it('falls back to Home for a stale cold-start unfinished workout notification', async () => {
    mockGetLastNotificationResponseAsync.mockResolvedValueOnce(
      notificationResponse(UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE),
    );
    (query as jest.Mock).mockReturnValue([]);

    renderRootNavigator();
    await flushPromises();

    mockNavigationReady = true;
    mockCapturedOnReady?.();

    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
  });

  it('handles foreground unfinished workout notification responses when navigation is ready', () => {
    mockNavigationReady = true;
    renderRootNavigator();

    mockNotificationListener?.(notificationResponse(UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE));

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'ws-1' });
  });

  it('falls back to Home for stale foreground unfinished workout notification responses', () => {
    mockNavigationReady = true;
    (query as jest.Mock).mockReturnValue([]);
    renderRootNavigator();

    mockNotificationListener?.(notificationResponse(UNFINISHED_WORKOUT_REMINDER_NOTIFICATION_TYPE));

    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'Home' });
  });

  it('removes the notification response listener on unmount', () => {
    renderRootNavigator();

    expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    mockEffectCleanup?.();

    expect(mockRemoveNotificationListener).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated notification responses', () => {
    mockNavigationReady = true;
    renderRootNavigator();

    mockNotificationListener?.(notificationResponse('rest_timer'));
    mockNotificationListener?.(notificationResponse(undefined));

    expect(query).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses Templates copy for template stack titles', () => {
    renderRootNavigator();

    expect(mockStackScreens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'PrebuiltPlans',
          options: expect.objectContaining({ title: 'Templates' }),
        }),
        expect.objectContaining({
          name: 'PrebuiltPlanPreview',
          options: expect.objectContaining({ title: 'Template preview' }),
        }),
      ]),
    );
    expect(mockStackScreens).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'PrebuiltPlans',
          options: expect.objectContaining({ title: 'Prebuilt plans' }),
        }),
      ]),
    );
  });

  it('uses Session copy for the DayDetail route title', () => {
    renderRootNavigator();

    expect(mockStackScreens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DayDetail',
          options: expect.objectContaining({ title: 'Session' }),
        }),
      ]),
    );
    expect(mockStackScreens).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DayDetail',
          options: expect.objectContaining({ title: 'Day' }),
        }),
      ]),
    );
  });

  it('does not register the Debug route when Debug is disabled', () => {
    mockIsDebugScreenEnabled = false;

    renderRootNavigator();

    expect(mockStackScreens).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Debug' })]),
    );
  });

  it('registers the Debug route when Debug is enabled', () => {
    mockIsDebugScreenEnabled = true;

    renderRootNavigator();

    expect(mockStackScreens).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Debug' })]),
    );
  });
});
