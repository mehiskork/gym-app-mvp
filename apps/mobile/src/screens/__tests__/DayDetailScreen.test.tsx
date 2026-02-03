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

jest.mock('expo-haptics', () => ({
    selectionAsync: jest.fn(),
}));

jest.mock('react-native-draggable-flatlist', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('DraggableFlatList', props, children),
    };
});

jest.mock('react-native', () => {
    const React = require('react');
    return {
        Alert: { alert: jest.fn() },
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
        TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('TextInput', props, children),
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

jest.mock('../../db/dayExerciseRepo', () => ({
    deleteDayExercise: jest.fn(),
    getDayById: jest.fn(),
    listDayExercises: jest.fn(),
    renameDay: jest.fn(),
    reorderDayExercises: jest.fn(),
}));

import React from 'react';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import { Button, EmptyState, ListRow } from '../../ui';
import { DayDetailScreen } from '../DayDetailScreen';

type Nav = {
    navigate: jest.Mock;
    setOptions: jest.Mock;
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

describe('DayDetailScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
    });

    it('shows empty state and add exercise action when no exercises exist', () => {
        useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
        useStateMock.mockImplementationOnce(() => [[], jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = DayDetailScreen({
            navigation,
            route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
        } as never);

        type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
        const emptyStates = findElementsByType<EmptyStateProps>(element, EmptyState);
        expect(emptyStates[0]?.props.title).toBe('No exercises yet');

        type ButtonProps = React.ComponentProps<typeof Button>;
        const buttons = findElementsByType<ButtonProps>(element, Button);
        const addExerciseButton = buttons.find((button) => button.props.title === 'Add exercise');

        if (!addExerciseButton?.props.onPress) {
            throw new Error('Expected Add exercise button to be rendered.');
        }

        addExerciseButton.props.onPress({} as never);

        expect(navigation.navigate).toHaveBeenCalledWith('ExercisePicker', { dayId: 'day-1' });
    });

    it('renders exercise list rows when exercises exist', () => {
        const items = [
            {
                id: 'day-ex-1',
                program_day_id: 'day-1',
                exercise_id: 'bench',
                exercise_name: 'Bench Press',
                position: 1,
                notes: null,
            },
        ];

        useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['Push', jest.fn()]);
        useStateMock.mockImplementationOnce(() => [items, jest.fn()]);

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = DayDetailScreen({
            navigation,
            route: { key: 'DayDetail', name: 'DayDetail', params: { dayId: 'day-1' } },
        } as never);

        type FlatListProps = React.ComponentProps<typeof DraggableFlatList>;
        const lists = findElementsByType<FlatListProps>(element, DraggableFlatList);
        const list = lists[0];

        if (!list) {
            throw new Error('Expected DraggableFlatList to be rendered.');
        }
        const renderItem = list.props.renderItem;
        if (!renderItem) {
            throw new Error('Expected renderItem to be defined.');
        }

        type Item = (typeof items)[number];
        const typedRenderItem = renderItem as (params: RenderItemParams<Item>) => React.ReactElement;
        const rowNode = typedRenderItem({
            item: items[0],
            drag: jest.fn(),
            isActive: false,
            getIndex: () => 0,
        });

        if (!React.isValidElement(rowNode)) {
            throw new Error('Expected exercise row to be a React element.');
        }

        const row = rowNode as React.ReactElement<React.ComponentProps<typeof ListRow>>;
        expect(row.props.title).toBe('Bench Press');
    });
});