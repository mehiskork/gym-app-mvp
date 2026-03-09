jest.mock('react-native', () => {
    const React = require('react');
    return {
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('Pressable', props, children),
        FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: { data: unknown[]; renderItem: (item: { item: unknown }) => React.ReactNode; ListEmptyComponent?: React.ReactNode }) =>
            React.createElement('FlatList', props, data.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent),
        View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('View', props, children),
        Alert: { alert: jest.fn() },
        Platform: { OS: 'ios' },
        StyleSheet: { create: (x: unknown) => x },
    };
});

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    return { Ionicons: (props: unknown) => React.createElement('Ionicons', props) };
});

jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn(),
        useMemo: (fn: () => unknown) => fn(),
        useCallback: (fn: () => unknown) => fn,
    };
});

jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    return {
        SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('SafeAreaView', props, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
});

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock('../../db/appMetaRepo', () => ({ getOrCreateLocalUserId: () => 'u1' }));
jest.mock('../../db/exerciseRepo', () => ({ listExercises: jest.fn() }));
jest.mock('../../db/dayExerciseRepo', () => ({ addExerciseToDay: jest.fn() }));
jest.mock('../../db/workoutLoggerRepo', () => ({ swapWorkoutSessionExercise: jest.fn() }));

import React from 'react';
import { Pressable } from 'react-native';
import { ExercisePickerScreen } from '../ExercisePickerScreen';
import { Button } from '../../ui';
import { listExercises } from '../../db/exerciseRepo';
import { swapWorkoutSessionExercise } from '../../db/workoutLoggerRepo';

const findByType = (node: React.ReactNode, type: React.ElementType | string, acc: React.ReactElement[] = []) => {
    if (!node) return acc;
    if (Array.isArray(node)) {
        node.forEach((x) => findByType(x, type, acc));
        return acc;
    }
    if (React.isValidElement(node)) {
        if (node.type === type) acc.push(node);
        findByType((node.props as { children?: React.ReactNode }).children, type, acc);
    }
    return acc;
};

describe('ExercisePickerScreen swap mode', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        (swapWorkoutSessionExercise as jest.Mock).mockReset();
        (listExercises as jest.Mock).mockReturnValue([{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }]);
    });

    it('closes without changes when cancel is pressed', () => {
        useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
        useStateMock.mockImplementationOnce(() => [[{ id: 'ex-2', name: 'Incline Bench', is_custom: 1 }], jest.fn()]);

        const navigation = { goBack: jest.fn(), navigate: jest.fn() };
        const element = ExercisePickerScreen({ navigation, route: { key: 'ExercisePicker', name: 'ExercisePicker', params: { swapSessionId: 's1', swapSessionExerciseId: 'wse-1' } } } as never);

        const buttons = findByType(element, Button);
        const closeButton = buttons.find((b) => (b.props as { title?: string }).title === 'Close');
        (closeButton?.props as { onPress: () => void }).onPress();

        expect(navigation.goBack).toHaveBeenCalled();
        expect(swapWorkoutSessionExercise).not.toHaveBeenCalled();
    });

});
