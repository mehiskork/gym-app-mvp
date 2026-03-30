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
  useFocusEffect: jest.fn(),
  useNavigation: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (styles: unknown) => styles,
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SafeAreaView', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props: unknown) => React.createElement('Ionicons', props),
  };
});

jest.mock('../../features/today/TodayHero', () => {
  const React = require('react');
  return {
    TodayHero: (props: unknown) => React.createElement('TodayHero', props),
  };
});

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
  getInProgressSession: jest.fn(),
}));

jest.mock('../../db/workoutPlanRepo', () => ({
  getWorkoutPlanById: jest.fn(),
  listWorkoutPlans: jest.fn(),
}));

jest.mock('../../db/weeklyRepo', () => ({
  getThisWeekSummary: jest.fn(),
}));

jest.mock('../../db/historyRepo', () => ({
  listRecentSessionSummaries: jest.fn(),
}));

import React from 'react';
import { useNavigation } from '@react-navigation/native';

import { Screen } from '../../ui/Screen';
import { TodayScreen } from '../TodayScreen';
import { getInProgressSession } from '../../db/workoutSessionRepo';
import { getThisWeekSummary } from '../../db/weeklyRepo';
import { listRecentSessionSummaries } from '../../db/historyRepo';
import { getWorkoutPlanById, listWorkoutPlans } from '../../db/workoutPlanRepo';

const findElementsByType = <P,>(
  node: React.ReactNode,
  type: React.ElementType,
  acc: Array<React.ReactElement<P>> = [],
) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findElementsByType<P>(child, type, acc));
    return acc;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if (node.type === type) acc.push(node as React.ReactElement<P>);
    return findElementsByType<P>(node.props.children, type, acc);
  }
  return acc;
};

describe('Screen insets', () => {
  const useStateMock = React.useState as jest.Mock;
  const useNavigationMock = useNavigation as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useNavigationMock.mockReset();
    useStateMock.mockImplementation((value: unknown) => [value, jest.fn()]);
    useNavigationMock.mockReturnValue({ navigate: jest.fn() });
    (getInProgressSession as jest.Mock).mockReturnValue(null);
    (getWorkoutPlanById as jest.Mock).mockReturnValue({ name: 'Plan' });
    (listWorkoutPlans as jest.Mock).mockReturnValue([]);
    (getThisWeekSummary as jest.Mock).mockReturnValue({ workouts: 0, total_kg: 0 });
    (listRecentSessionSummaries as jest.Mock).mockReturnValue([]);
  });

  it('uses bottomInset="tabBar" for tab-root screens', () => {
    const element = TodayScreen();

    type ScreenProps = React.ComponentProps<typeof Screen>;
    const screens = findElementsByType<ScreenProps>(element, Screen);

    expect(screens[0]?.props.bottomInset).toBe('tabBar');
  });
});
