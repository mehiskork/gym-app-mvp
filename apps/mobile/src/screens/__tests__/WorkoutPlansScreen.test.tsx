jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn(),
        useCallback: (fn: () => unknown) => fn,
        useMemo: (fn: () => unknown) => fn(),
    };
});

jest.mock('react-native', () => {
    const React = require('react');

    return {
        Alert: { alert: jest.fn() },
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
            create: (styles: any) => styles,
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

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: jest.fn(),
    useNavigation: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    return {
        Ionicons: ({ name, ...props }: { name: string }) =>
            React.createElement('Ionicons', { name, ...props }),
    };
});

jest.mock('../../db/workoutPlanRepo', () => ({
    createWorkoutPlan: jest.fn(),
    deleteWorkoutPlan: jest.fn(),
    listWorkoutPlansWithDayCounts: jest.fn(),
}));

import React from 'react';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { WorkoutPlansScreen } from '../WorkoutPlansScreen';

type Nav = { navigate: jest.Mock };

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

describe('WorkoutPlansScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        (useNavigation as jest.Mock).mockReturnValue({ navigate: jest.fn() });
    });

    it('shows day count subtitles for plan rows', () => {
        const plans = [
            { id: 'plan-1', name: 'Plan A', description: null, is_template: 0, dayCount: 1 },
            { id: 'plan-2', name: 'Plan B', description: null, is_template: 0, dayCount: 4 },
            { id: 'plan-3', name: 'Plan C', description: null, is_template: 0, dayCount: 0 },
        ];

        useStateMock
            .mockImplementationOnce(() => [plans, jest.fn()])
            .mockImplementationOnce(() => ['', jest.fn()]);

        const element = WorkoutPlansScreen();

        type FlatListProps = React.ComponentProps<typeof FlatList>;
        const list = findElementByType<FlatListProps>(element, FlatList);
        const renderItem = list?.props.renderItem;
        if (!renderItem) {
            throw new Error('Expected FlatList renderItem to be defined.');
        }

        const makeRow = (index: number) => {
            const rowNode = renderItem({
                item: plans[index],
                index,
                separators: {
                    highlight: jest.fn(),
                    unhighlight: jest.fn(),
                    updateProps: jest.fn(),
                },
            });
            if (!React.isValidElement(rowNode)) {
                throw new Error('Expected plan row to be a React element.');
            }
            return rowNode as React.ReactElement<{ subtitle: string }>;
        };

        expect(makeRow(0).props.subtitle).toBe('1 day');
        expect(makeRow(1).props.subtitle).toBe('4 days');
        expect(makeRow(2).props.subtitle).toBe('No days yet');
    });

    it('navigates to plan detail when a row is pressed', () => {
        const plans = [
            { id: 'plan-1', name: 'Plan A', description: null, is_template: 0, dayCount: 2 },
        ];
        const navigation: Nav = { navigate: jest.fn() };
        (useNavigation as jest.Mock).mockReturnValue(navigation);

        useStateMock
            .mockImplementationOnce(() => [plans, jest.fn()])
            .mockImplementationOnce(() => ['', jest.fn()]);

        const element = WorkoutPlansScreen();

        type FlatListProps = React.ComponentProps<typeof FlatList>;
        const list = findElementByType<FlatListProps>(element, FlatList);
        const renderItem = list?.props.renderItem;
        if (!renderItem) {
            throw new Error('Expected FlatList renderItem to be defined.');
        }

        const rowNode = renderItem({
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

        const row = rowNode as React.ReactElement<{ onPress?: () => void }>;
        row.props.onPress?.();

        expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanDetail', {
            workoutPlanId: 'plan-1',
        });
    });
});