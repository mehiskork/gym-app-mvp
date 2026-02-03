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
}));

jest.mock('react-native', () => {
    const React = require('react');
    return {
        Alert: { alert: jest.fn() },
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('ScrollView', props, children),
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
        StyleSheet: {
            create: (styles: unknown) => styles,
            flatten: (styles: unknown) => styles,
        },
        Platform: { select: () => 'monospace' },
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
        Ionicons: ({ name, ...props }: { name: string }) =>
            React.createElement('Ionicons', { name, ...props }),
    };
});

jest.mock('../../db/workoutPlanRepo', () => ({
    addDayToWorkoutPlan: jest.fn(),
    deleteWorkoutPlan: jest.fn(),
    getWorkoutPlanById: jest.fn(),
    listDaysForWorkoutPlan: jest.fn(),
}));
jest.mock('../../db/workoutSessionRepo', () => ({
    createSessionFromPlanDay: jest.fn(),
}));
import React from 'react';

import { EmptyState, ListRow } from '../../ui';
import { WorkoutPlanDetailScreen } from '../WorkoutPlanDetailScreen';
import { createSessionFromPlanDay } from '../../db/workoutSessionRepo';
type Nav = {
    navigate: jest.Mock;
    goBack: jest.Mock;
};

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

describe('WorkoutPlanDetailScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
    });

    it('renders day rows when days exist', () => {
        const plan = { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 };
        const days = [{ id: 'day-1', name: 'Day 1', day_index: 1 }];

        useStateMock.mockImplementationOnce(() => [plan, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [days, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), goBack: jest.fn() };
        const element = WorkoutPlanDetailScreen({
            navigation,
            route: {
                key: 'WorkoutPlanDetail',
                name: 'WorkoutPlanDetail',
                params: { workoutPlanId: 'plan-1' },
            },
        } as never);

        type ListRowProps = React.ComponentProps<typeof ListRow>;
        const rows = findElementsByType<ListRowProps>(element, ListRow);

        expect(rows[0]?.props.title).toBe('Day 1');
    });

    it('navigates to day detail when a day row is pressed', () => {
        const plan = { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 };
        const days = [{ id: 'day-1', name: 'Day 1', day_index: 1 }];

        useStateMock.mockImplementationOnce(() => [plan, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [days, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), goBack: jest.fn() };
        const element = WorkoutPlanDetailScreen({
            navigation,
            route: {
                key: 'WorkoutPlanDetail',
                name: 'WorkoutPlanDetail',
                params: { workoutPlanId: 'plan-1' },
            },
        } as never);

        type ListRowProps = React.ComponentProps<typeof ListRow>;
        const rows = findElementsByType<ListRowProps>(element, ListRow);
        const firstRow = rows[0];

        if (!firstRow?.props.onPress) {
            throw new Error('Expected day row to have onPress.');
        }

        firstRow.props.onPress({} as never);

        expect(navigation.navigate).toHaveBeenCalledWith('DayDetail', { dayId: 'day-1' });
    });

    it('shows empty state when there are no days', () => {
        const plan = { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 };

        useStateMock.mockImplementationOnce(() => [plan, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), goBack: jest.fn() };
        const element = WorkoutPlanDetailScreen({
            navigation,
            route: {
                key: 'WorkoutPlanDetail',
                name: 'WorkoutPlanDetail',
                params: { workoutPlanId: 'plan-1' },
            },
        } as never);

        type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
        const emptyStates = findElementsByType<EmptyStateProps>(element, EmptyState);

        expect(emptyStates[0]?.props.title).toBe('No days yet');
    });
    it('starts a session and navigates to workout session in picker mode', () => {
        const plan = { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 };
        const days = [{ id: 'day-1', name: 'Day 1', day_index: 1 }];

        useStateMock.mockImplementationOnce(() => [plan, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [days, jest.fn()]);

        (createSessionFromPlanDay as jest.Mock).mockReturnValue('session-1');

        const navigation: Nav = { navigate: jest.fn(), goBack: jest.fn() };
        const element = WorkoutPlanDetailScreen({
            navigation,
            route: {
                key: 'WorkoutPlanDetail',
                name: 'WorkoutPlanDetail',
                params: { workoutPlanId: 'plan-1', mode: 'pickDayToStart' },
            },
        } as never);

        type ListRowProps = React.ComponentProps<typeof ListRow>;
        const rows = findElementsByType<ListRowProps>(element, ListRow);
        const firstRow = rows[0];

        if (!firstRow?.props.onPress) {
            throw new Error('Expected day row to have onPress.');
        }

        firstRow.props.onPress({} as never);

        expect(createSessionFromPlanDay).toHaveBeenCalledWith({
            workoutPlanId: 'plan-1',
            dayId: 'day-1',
        });
        expect(navigation.navigate).toHaveBeenCalledWith('WorkoutSession', {
            sessionId: 'session-1',
        });
    });
});