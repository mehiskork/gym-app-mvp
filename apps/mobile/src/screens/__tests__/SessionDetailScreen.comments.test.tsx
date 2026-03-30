jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
    useCallback: (fn: () => unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
});

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback: () => void) => callback()),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SafeAreaView', props, children),
  };
});

jest.mock('../../db/historyRepo', () => ({
  getSessionDetail: jest.fn(),
}));

jest.mock('../../db/prRepo', () => ({
  listSessionPrEvents: jest.fn(() => []),
  recomputeSessionPrsIfNeeded: jest.fn(),
}));

import React from 'react';
import { getSessionDetail } from '../../db/historyRepo';
import { SessionDetailScreen } from '../SessionDetailScreen';
import type { SessionSetRow } from '../../db/historyRepo';

describe('SessionDetailScreen comments', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
    (getSessionDetail as jest.Mock).mockReset();
  });

  it('shows exercise comment in history details', () => {
    const session = {
      id: 's-1',
      title: 'Push Day',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: '2026-01-01T01:00:00Z',
      workout_note: 'Solid pace',
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'bench',
        exercise_name: 'Bench Press',
        position: 1,
        notes: 'Controlled tempo',
      },
    ];
    const sets: SessionSetRow[] = [];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-1' } },
    } as never);

    expect(JSON.stringify(element)).toContain('Comment: ');
    expect(JSON.stringify(element)).toContain('Controlled tempo');
    expect(JSON.stringify(element)).toContain('Workout note: ');
    expect(JSON.stringify(element)).toContain('Solid pace');
  });
});
