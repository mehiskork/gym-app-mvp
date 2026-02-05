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
        ActivityIndicator: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('ActivityIndicator', props, children),
        FlatList: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('FlatList', props, children),
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('ScrollView', props, children),
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
        StyleSheet: {
            create: (styles: unknown) => styles,
            hairlineWidth: 1,
            absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
        },
        Modal: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Modal', props, children),
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
    listWorkoutPlansWithSessionCounts: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
    getInProgressSession: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { EmptyState } from '../../ui';
import { StartWorkoutScreen } from '../StartWorkoutScreen';
import { listWorkoutPlansWithSessionCounts } from '../../db/workoutPlanRepo';
import { getInProgressSession } from '../../db/workoutSessionRepo';

type Nav = {
    navigate: jest.Mock;
    replace: jest.Mock;
};

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

describe('StartWorkoutScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);

        (listWorkoutPlansWithSessionCounts as jest.Mock).mockReset();
        (getInProgressSession as jest.Mock).mockReset();
        (getInProgressSession as jest.Mock).mockReturnValue(null);

        (useFocusEffect as jest.Mock).mockReset();
        (useFocusEffect as jest.Mock).mockImplementation((callback: () => void) => callback());
    });

    it('shows empty state when there are no plans', () => {
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
        const emptyState = findElementByType<EmptyStateProps>(element, EmptyState);

        expect(emptyState?.props.title).toBe('No plans yet');
    });

    it('shows session-count subtitle and navigates for plans with sessions', () => {
        const plans = [
            { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0, sessionCount: 3 },
        ];

        useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        type FlatListProps = React.ComponentProps<typeof FlatList>;
        const list = findElementByType<FlatListProps>(element, FlatList);

        if (!list?.props.renderItem) {
            throw new Error('Expected FlatList renderItem to be defined.');
        }

        const rowNode = list.props.renderItem({
            item: plans[0],
            index: 0,
            separators: {
                highlight: jest.fn(),
                unhighlight: jest.fn(),
                updateProps: jest.fn(),
            },
        });

        if (!React.isValidElement(rowNode)) {
            throw new Error('Expected plan row to be a React element.');
        }

        const row = rowNode as React.ReactElement<{
            title: string;
            subtitle: string;
            onPress?: () => void;
            showChevron: boolean;
        }>;

        expect(row.props.title).toBe('Strength Plan');
        expect(row.props.subtitle).toBe('3 sessions');
        expect(row.props.showChevron).toBe(true);

        row.props.onPress?.();

        expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanDetail', {
            workoutPlanId: 'plan-1',
            mode: 'pickSessionToStart',
        });
    });

    it('shows singular session subtitle for a 1-session plan', () => {
        const plans = [
            { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0, sessionCount: 1 },
        ];

        useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        type FlatListProps = React.ComponentProps<typeof FlatList>;
        const list = findElementByType<FlatListProps>(element, FlatList);

        if (!list?.props.renderItem) {
            throw new Error('Expected FlatList renderItem to be defined.');
        }

        const rowNode = list.props.renderItem({
            item: plans[0],
            index: 0,
            separators: {
                highlight: jest.fn(),
                unhighlight: jest.fn(),
                updateProps: jest.fn(),
            },
        });

        if (!React.isValidElement(rowNode)) {
            throw new Error('Expected plan row to be a React element.');
        }

        const row = rowNode as React.ReactElement<{ subtitle: string; showChevron: boolean }>;

        expect(row.props.subtitle).toBe('1 session');
        expect(row.props.showChevron).toBe(true);
    });

    it('hides chevron and disables press for plans with zero sessions', () => {
        const plans = [
            { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0, sessionCount: 0 },
        ];

        useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        type FlatListProps = React.ComponentProps<typeof FlatList>;
        const list = findElementByType<FlatListProps>(element, FlatList);

        if (!list?.props.renderItem) {
            throw new Error('Expected FlatList renderItem to be defined.');
        }

        const rowNode = list.props.renderItem({
            item: plans[0],
            index: 0,
            separators: {
                highlight: jest.fn(),
                unhighlight: jest.fn(),
                updateProps: jest.fn(),
            },
        });

        if (!React.isValidElement(rowNode)) {
            throw new Error('Expected plan row to be a React element.');
        }

        const row = rowNode as React.ReactElement<{
            subtitle: string;
            showChevron: boolean;
            onPress?: () => void;
        }>;

        expect(row.props.subtitle).toBe('No sessions yet');
        expect(row.props.showChevron).toBe(false);
        expect(row.props.onPress).toBeUndefined();
    });

    it('loads plans on focus when no active session exists', () => {
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
        (listWorkoutPlansWithSessionCounts as jest.Mock).mockReturnValue([]);

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };

        StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        expect(listWorkoutPlansWithSessionCounts).toHaveBeenCalledTimes(1);
        expect(navigation.replace).not.toHaveBeenCalled();
    });

    it('does not load plans on focus when an active session exists', () => {
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
        (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-123' });

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };

        StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        expect(listWorkoutPlansWithSessionCounts).not.toHaveBeenCalled();
        expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-123' });
    });
    it('replaces to active workout on focus', () => {
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);
        (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-123' });

        const navigation: Nav = { navigate: jest.fn(), replace: jest.fn() };

        StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        expect(navigation.replace).toHaveBeenCalledWith('WorkoutSession', { sessionId: 'session-123' });
    });
});