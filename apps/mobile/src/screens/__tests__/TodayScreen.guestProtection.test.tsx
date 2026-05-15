jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useRef: jest.fn((initial: unknown) => ({ current: initial })),
    useState: jest.fn(),
    useCallback: (fn: unknown) => fn,
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
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

jest.mock('../../ui', () => {
  const React = require('react');
  return {
    Button: ({ title, ...props }: { title: string }) =>
      React.createElement('Button', { title, ...props }),
    Card: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Card', props, children),
    Screen: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Screen', props, children),
    Snackbar: (props: unknown) => React.createElement('Snackbar', props),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
  };
});

jest.mock('../../theme/tokens', () => ({
  tokens: {
    spacing: { sm: 8, md: 12, lg: 16 },
  },
}));

jest.mock('../../navigation/routes', () => ({
  TAB_ROUTES: {
    History: 'History',
    Home: 'Home',
    WorkoutPlans: 'WorkoutPlans',
  },
}));

jest.mock('../../features/today/TodayPrimaryAction', () => {
  const React = require('react');
  return {
    TodayPrimaryAction: (props: unknown) => React.createElement('TodayPrimaryAction', props),
  };
});

jest.mock('../../features/today/TodayRecentActivity', () => {
  const React = require('react');
  return {
    TodayRecentActivity: (props: unknown) => React.createElement('TodayRecentActivity', props),
  };
});

jest.mock('../../features/today/TodayWeeklyStats', () => {
  const React = require('react');
  return {
    TodayWeeklyStats: (props: unknown) => React.createElement('TodayWeeklyStats', props),
  };
});

jest.mock('../../db/workoutSessionRepo', () => ({
  createQuickWorkoutSession: jest.fn(() => 'quick-session-1'),
  getInProgressSession: jest.fn(() => null),
}));

jest.mock('../../db/workoutPlanRepo', () => ({
  listWorkoutPlans: jest.fn(() => []),
}));

jest.mock('../../db/weeklyRepo', () => ({
  getThisWeekSummary: jest.fn(() => ({ workouts: 0, total_kg: 0 })),
}));

jest.mock('../../db/historyRepo', () => ({
  listRecentSessionSummaries: jest.fn(() => []),
}));

jest.mock('../../auth/googleAccountOrchestrator', () => ({
  createGoogleAccountFromGuest: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../auth/localAccountState', () => ({
  resolveLocalAccountState: jest.fn(() =>
    Promise.resolve({ status: 'guest', accountSession: null }),
  ),
}));

jest.mock('../../auth/accountDeletion', () => ({
  hasPendingAccountDeletionRecovery: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../../auth/identityTransition', () => ({
  resetToGuestBootstrap: jest.fn(() => Promise.resolve()),
}));

import React from 'react';

import { createGoogleAccountFromGuest } from '../../auth/googleAccountOrchestrator';
import { resetToGuestBootstrap } from '../../auth/identityTransition';
import { createQuickWorkoutSession, getInProgressSession } from '../../db/workoutSessionRepo';
import { TodayScreen } from '../TodayScreen';

const useStateMock = React.useState as jest.Mock;

type RecentSession = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  volume: number;
  prs: number;
};

type RenderOptions = {
  accountPromptError?: string | null;
  accountSignInBusy?: boolean;
  inProgressId?: string | null;
  localAccountStatus?: 'guest' | 'linked_with_usable_account' | 'linked_reauth_required' | null;
  recentSessions?: RecentSession[];
  accountDeletionRecoveryActive?: boolean;
  setAccountPromptError?: jest.Mock;
  quickStartError?: string | null;
  setQuickStartError?: jest.Mock;
  weeklyWorkouts?: number;
  hasPlans?: boolean;
};

function renderTodayScreen({
  accountPromptError = null,
  accountSignInBusy = false,
  inProgressId = null,
  localAccountStatus = 'guest',
  recentSessions = [],
  accountDeletionRecoveryActive = false,
  setAccountPromptError = jest.fn(),
  quickStartError = null,
  setQuickStartError = jest.fn(),
  weeklyWorkouts = 0,
  hasPlans = false,
}: RenderOptions = {}) {
  useStateMock.mockReset();
  useStateMock
    .mockImplementationOnce(() => [inProgressId, jest.fn()])
    .mockImplementationOnce(() => [null, jest.fn()])
    .mockImplementationOnce(() => [hasPlans, jest.fn()])
    .mockImplementationOnce(() => [weeklyWorkouts, jest.fn()])
    .mockImplementationOnce(() => [0, jest.fn()])
    .mockImplementationOnce(() => [recentSessions, jest.fn()])
    .mockImplementationOnce(() => [localAccountStatus, jest.fn()])
    .mockImplementationOnce(() => [accountSignInBusy, jest.fn()])
    .mockImplementationOnce(() => [accountPromptError, setAccountPromptError])
    .mockImplementationOnce(() => [quickStartError, setQuickStartError])
    .mockImplementationOnce(() => [accountDeletionRecoveryActive, jest.fn()]);

  return TodayScreen();
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
  return findElements(node, (element) => element.type === 'Button');
}

function todayPrimaryAction(node: React.ReactNode) {
  return findElements(node, (element) => element.type === 'TodayPrimaryAction')[0] ?? null;
}

const recentSession: RecentSession = {
  id: 'session-1',
  title: 'Workout',
  started_at: '2026-05-01T10:00:00.000Z',
  ended_at: '2026-05-01T10:30:00.000Z',
  volume: 1000,
  prs: 0,
};

describe('TodayScreen guest progress protection prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createQuickWorkoutSession as jest.Mock).mockReturnValue('quick-session-1');
    (getInProgressSession as jest.Mock).mockReturnValue(null);
  });

  it('starts a quick workout from no-plan Home and opens WorkoutSession', () => {
    const tree = expandTree(renderTodayScreen());
    const primaryAction = todayPrimaryAction(tree);

    primaryAction?.props.onQuickStart();

    expect(createQuickWorkoutSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'quick-session-1' });
  });

  it('resumes an active workout during quick start instead of creating another session', () => {
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'active-session-1' });
    const tree = expandTree(renderTodayScreen());
    const primaryAction = todayPrimaryAction(tree);

    primaryAction?.props.onQuickStart();

    expect(createQuickWorkoutSession).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'active-session-1' });
  });

  it('handles quick-start in-progress race by opening the existing workout', () => {
    (createQuickWorkoutSession as jest.Mock).mockImplementation(() => {
      throw new Error('WORKOUT_IN_PROGRESS:race-session-1');
    });
    const tree = expandTree(renderTodayScreen());
    const primaryAction = todayPrimaryAction(tree);

    primaryAction?.props.onQuickStart();

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'race-session-1' });
  });

  it('shows quick-start feedback for unexpected session creation errors', () => {
    const setQuickStartError = jest.fn();
    (createQuickWorkoutSession as jest.Mock).mockImplementation(() => {
      throw new Error('database unavailable');
    });
    const tree = expandTree(renderTodayScreen({ setQuickStartError }));
    const primaryAction = todayPrimaryAction(tree);

    primaryAction?.props.onQuickStart();

    expect(setQuickStartError).toHaveBeenCalledWith("Couldn't start workout. Try again.");
    expect(mockNavigate).not.toHaveBeenCalledWith(
      'WorkoutSession',
      expect.objectContaining({ sessionId: expect.any(String) }),
    );

    const feedbackTree = expandTree(
      renderTodayScreen({ quickStartError: "Couldn't start workout. Try again." }),
    );
    const snackbars = findElements(feedbackTree, (element) => element.type === 'Snackbar');
    expect(snackbars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            message: "Couldn't start workout. Try again.",
          }),
        }),
      ]),
    );
  });

  it('keeps Home plan navigation callbacks unchanged', () => {
    const tree = expandTree(renderTodayScreen({ hasPlans: true }));
    const primaryAction = todayPrimaryAction(tree);

    primaryAction?.props.onStart();
    primaryAction?.props.onCreatePlan();
    primaryAction?.props.onBrowsePlans();

    expect(mockNavigate).toHaveBeenCalledWith('StartWorkout');
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'WorkoutPlans' });
    expect(mockNavigate).toHaveBeenCalledWith('PrebuiltPlans');
  });

  it('does not show the card for a guest with no meaningful local data', () => {
    const tree = expandTree(renderTodayScreen({ recentSessions: [], weeklyWorkouts: 0 }));

    expect(textContent(tree)).not.toContain('Protect your progress');
  });

  it('shows the card for a guest with meaningful local workout data', () => {
    const tree = expandTree(renderTodayScreen({ recentSessions: [recentSession] }));
    const text = textContent(tree);

    expect(text).toContain('Protect your progress');
    expect(text).toContain(
      'Sign in with Google to sync your workout data and keep it safe if you change phones.',
    );
    expect(buttons(tree).map((button) => button.props.title)).toContain('Sign in with Google');
  });

  it('does not show the card for signed-in users', () => {
    const tree = expandTree(
      renderTodayScreen({
        localAccountStatus: 'linked_with_usable_account',
        recentSessions: [recentSession],
      }),
    );

    expect(textContent(tree)).not.toContain('Protect your progress');
  });

  it('does not show the card while account sign-in is already in progress', () => {
    const tree = expandTree(
      renderTodayScreen({ accountSignInBusy: true, recentSessions: [recentSession] }),
    );

    expect(textContent(tree)).not.toContain('Protect your progress');
  });

  it('does not show the card while account deletion recovery is active', () => {
    const tree = expandTree(
      renderTodayScreen({
        accountDeletionRecoveryActive: true,
        recentSessions: [recentSession],
      }),
    );

    expect(textContent(tree)).not.toContain('Protect your progress');
  });

  it('uses the existing guest-to-account migration path without local reset', async () => {
    const tree = expandTree(renderTodayScreen({ recentSessions: [recentSession] }));
    const signInButton = buttons(tree).find(
      (button) => button.props.title === 'Sign in with Google',
    );

    signInButton?.props.onPress();
    await Promise.resolve();
    await Promise.resolve();

    expect(createGoogleAccountFromGuest).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
  });

  it('prevents double-submit while guest sign-in is in progress', async () => {
    const tree = expandTree(renderTodayScreen({ recentSessions: [recentSession] }));
    const signInButton = buttons(tree).find(
      (button) => button.props.title === 'Sign in with Google',
    );

    signInButton?.props.onPress();
    signInButton?.props.onPress();
    await Promise.resolve();
    await Promise.resolve();

    expect(createGoogleAccountFromGuest).toHaveBeenCalledTimes(1);
    expect(resetToGuestBootstrap).not.toHaveBeenCalled();
  });

  it('shows friendly feedback on sign-in failure without exposing raw errors', async () => {
    (createGoogleAccountFromGuest as jest.Mock).mockRejectedValueOnce(
      new Error('Firebase token raw-stack backend detail'),
    );
    const setAccountPromptError = jest.fn();
    const tree = expandTree(
      renderTodayScreen({ recentSessions: [recentSession], setAccountPromptError }),
    );
    const signInButton = buttons(tree).find(
      (button) => button.props.title === 'Sign in with Google',
    );

    signInButton?.props.onPress();
    await Promise.resolve();
    await Promise.resolve();

    expect(setAccountPromptError).toHaveBeenCalledWith(
      "Couldn't finish Google sign-in. Check your connection and try again.",
    );

    const feedbackTree = expandTree(
      renderTodayScreen({
        accountPromptError: "Couldn't finish Google sign-in. Check your connection and try again.",
        recentSessions: [recentSession],
      }),
    );
    const snackbars = findElements(feedbackTree, (element) => element.type === 'Snackbar');
    expect(snackbars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            message: "Couldn't finish Google sign-in. Check your connection and try again.",
          }),
        }),
      ]),
    );
    expect(textContent(feedbackTree)).not.toContain('Firebase token raw-stack backend detail');
  });
});
