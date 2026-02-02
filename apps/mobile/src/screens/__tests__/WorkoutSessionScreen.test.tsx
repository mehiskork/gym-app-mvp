jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn(),
        useCallback: (fn: () => unknown) => fn,
        useMemo: (fn: () => unknown) => fn(),
        useEffect: jest.fn(),
        useRef: () => ({ current: null }),
    };
});

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
    selectionAsync: jest.fn(),
}));

jest.mock('react-native', () => {
    const React = require('react');
    return {
        KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('KeyboardAvoidingView', props, children),
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('ScrollView', props, children),
        Text: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Text', props, children),
        TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('TextInput', props, children),
        View: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('View', props, children),
        Platform: { OS: 'ios', select: () => 'monospace' },
        Alert: { alert: jest.fn() },
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

jest.mock('../../db/workoutLoggerRepo', () => ({
    addWorkoutSet: jest.fn(),
    clearRestTimer: jest.fn(),
    deleteWorkoutSet: jest.fn(),
    getWorkoutLoggerData: jest.fn(),
    startRestTimer: jest.fn(),
    updateWorkoutSet: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
    completeSession: jest.fn(),
}));

import React from 'react';

import { WorkoutSessionScreen } from '../WorkoutSessionScreen';
import { ExerciseCard } from '../../features/workoutSession/ExerciseCard';
import { SetRow } from '../../features/workoutSession/SetRow';
import { getWorkoutLoggerData, updateWorkoutSet } from '../../db/workoutLoggerRepo';

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

describe('WorkoutSessionScreen', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        (updateWorkoutSet as jest.Mock).mockReset();
        (getWorkoutLoggerData as jest.Mock).mockReset();
    });

    it('renders the exercise and toggles a set', () => {
        const session = {
            id: 'session-1',
            title: 'Push Day',
            status: 'in_progress',
            started_at: '2024-01-01T00:00:00Z',
            rest_timer_end_at: null,
            rest_timer_seconds: null,
            rest_timer_label: null,
        };

        const exercises = [
            {
                id: 'exercise-1',
                exercise_id: 'bench-press',
                exercise_name: 'Bench Press',
                position: 1,
                sets: [
                    {
                        id: 'set-1',
                        workout_session_exercise_id: 'exercise-1',
                        set_index: 1,
                        weight: 100,
                        reps: 5,
                        rpe: null,
                        rest_seconds: 90,
                        notes: null,
                        is_completed: 0,
                    },
                    {
                        id: 'set-2',
                        workout_session_exercise_id: 'exercise-1',
                        set_index: 2,
                        weight: 100,
                        reps: 5,
                        rpe: null,
                        rest_seconds: 90,
                        notes: null,
                        is_completed: 0,
                    },
                ],
            },
        ];

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
        } as never);

        type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
        const exerciseCards = findElementsByType<ExerciseCardProps>(element, ExerciseCard);
        expect(exerciseCards[0]?.props.name).toBe('Bench Press');

        type SetRowProps = React.ComponentProps<typeof SetRow>;
        const setRows = findElementsByType<SetRowProps>(element, SetRow);
        expect(setRows).toHaveLength(2);

        setRows[0]?.props.onToggleComplete();

        expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 1 });
    });
});