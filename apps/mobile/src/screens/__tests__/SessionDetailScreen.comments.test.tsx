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

  it('marks incomplete history sets as incomplete instead of edit', () => {
    const session = {
      id: 's-2',
      title: 'Pull Session',
      started_at: '2026-01-02T00:00:00Z',
      ended_at: '2026-01-02T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'row',
        exercise_name: 'Row',
        exercise_type: 'strength',
        position: 1,
        notes: null,
      },
    ];
    const sets: SessionSetRow[] = [
      {
        id: 'set-1',
        workout_session_exercise_id: 'wse-1',
        set_index: 1,
        weight: 80,
        reps: 8,
        is_completed: 0,
      } as SessionSetRow,
    ];

    useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [sets, jest.fn()]);
    useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
    (getSessionDetail as jest.Mock).mockReturnValue({ session, exercises, sets });

    const element = SessionDetailScreen({
      navigation: { setOptions: jest.fn(), navigate: jest.fn() },
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-2' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain(' (incomplete)');
    expect(serialized).not.toContain(' (edit)');
  });

  it('formats cardio pace as min:sec per km in history details', () => {
    const session = {
      id: 's-3',
      title: 'Erg Session',
      started_at: '2026-01-03T00:00:00Z',
      ended_at: '2026-01-03T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'erg',
        exercise_name: 'Erg',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
        position: 1,
        notes: null,
        cardio_duration_minutes: null,
        cardio_distance_km: null,
        cardio_speed_kph: null,
        cardio_incline_percent: null,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: 355,
        cardio_floors: null,
        cardio_stair_level: null,
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
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-3' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Pace 5:55 /km');
    expect(serialized).not.toContain('355s/km');
  });

  it('does not render pace when cardio pace is null', () => {
    const session = {
      id: 's-4',
      title: 'Erg Session',
      started_at: '2026-01-04T00:00:00Z',
      ended_at: '2026-01-04T01:00:00Z',
      workout_note: null,
    };
    const exercises = [
      {
        id: 'wse-1',
        exercise_id: 'erg',
        exercise_name: 'Erg',
        exercise_type: 'cardio',
        cardio_profile: 'ergometer',
        position: 1,
        notes: null,
        cardio_duration_minutes: 20,
        cardio_distance_km: null,
        cardio_speed_kph: null,
        cardio_incline_percent: null,
        cardio_resistance_level: null,
        cardio_pace_seconds_per_km: null,
        cardio_floors: null,
        cardio_stair_level: null,
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
      route: { key: 'SessionDetail', name: 'SessionDetail', params: { sessionId: 's-4' } },
    } as never);

    const serialized = JSON.stringify(element);
    expect(serialized).toContain('Duration 20 min');
    expect(serialized).not.toContain('Pace ');
    expect(serialized).not.toContain('s/km');
  });
});
