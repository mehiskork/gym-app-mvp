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
    listWorkoutPlans: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';

import { EmptyState } from '../../ui';
import { StartWorkoutScreen } from '../StartWorkoutScreen';
import { listWorkoutPlans } from '../../db/workoutPlanRepo';

type Nav = {
    navigate: jest.Mock;
};

type TreeNode =
    | React.ReactElement
    | React.ReactElement[]
    | string
    | number
    | null
    | undefined;

const findElementByType = (node: TreeNode, type: unknown): React.ReactElement | null => {
    if (!node) return null;
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findElementByType(child, type);
            if (found) return found;
        }
        return null;
    }
    if (typeof node === 'string' || typeof node === 'number') return null;
    if (node.type === type) return node;
    return findElementByType(node.props?.children, type);
};

describe('StartWorkoutScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        (listWorkoutPlans as jest.Mock).mockReset();
    });

    it('shows empty state when there are no plans', () => {
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

        const navigation: Nav = { navigate: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        const emptyState = findElementByType(element, EmptyState);

        expect(emptyState?.props.title).toBe('No plans yet');
    });

    it('navigates to plan detail when a plan row is pressed', () => {
        const plans = [
            { id: 'plan-1', name: 'Strength Plan', description: null, is_template: 0 },
        ];

        useStateMock.mockImplementationOnce(() => [plans, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn() };
        const element = StartWorkoutScreen({
            navigation,
            route: { key: 'StartWorkout', name: 'StartWorkout' },
        } as never);

        const list = findElementByType(element, FlatList);

        expect(list).not.toBeNull();
        const row = list?.props.renderItem({ item: plans[0] });

        expect(row.props.title).toBe('Strength Plan');

        row.props.onPress();

        expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanDetail', {
            workoutPlanId: 'plan-1',
        });
    });
});
