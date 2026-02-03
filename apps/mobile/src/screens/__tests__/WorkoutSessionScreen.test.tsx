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
        StyleSheet: { flatten: (styles: unknown) => styles },
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
    restoreWorkoutSet: jest.fn(),
    getWorkoutLoggerData: jest.fn(),
    startRestTimer: jest.fn(),
    updateWorkoutSet: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
    completeSession: jest.fn(),
}));

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

import { WorkoutSessionScreen } from '../WorkoutSessionScreen';
import { ExerciseCard } from '../../features/workoutSession/ExerciseCard';
import { SetRow } from '../../features/workoutSession/SetRow';
import { Button, Card, Text } from '../../ui';
import { getWorkoutLoggerData, updateWorkoutSet } from '../../db/workoutLoggerRepo';
import { tokens } from '../../theme/tokens';

type Nav = {
    navigate: jest.Mock;
    setOptions: jest.Mock;
};

const findElementsByType = <P,>(
    node: React.ReactNode,
    type: React.ElementType | string,
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

const getPositionStyle = (style?: StyleProp<ViewStyle>) => {
    if (!style) return undefined;
    return (StyleSheet.flatten(style) as ViewStyle | undefined)?.position;
};

const resolveStyle = (styleProp: unknown) => {
    if (typeof styleProp === 'function') {
        return styleProp({ pressed: false });
    }
    return styleProp;
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
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-1' } },
        } as never);

        type ExerciseCardProps = React.ComponentProps<typeof ExerciseCard>;
        const exerciseCards = findElementsByType(element, ExerciseCard) as Array<
            React.ReactElement<ExerciseCardProps>
        >;
        expect(exerciseCards[0]?.props.name).toBe('Bench Press');

        type SetRowProps = React.ComponentProps<typeof SetRow>;
        const setRows = findElementsByType(element, SetRow) as Array<React.ReactElement<SetRowProps>>;
        expect(setRows).toHaveLength(2);

        setRows[0]?.props.onToggleComplete();

        expect(updateWorkoutSet).toHaveBeenCalledWith('set-1', { is_completed: 1 });
    });

    it('renders the finish button in the footer and triggers the finish flow', () => {
        const session = {
            id: 'session-2',
            title: 'Leg Day',
            status: 'in_progress',
            started_at: '2024-01-02T00:00:00Z',
            rest_timer_end_at: null,
            rest_timer_seconds: null,
            rest_timer_label: null,
        };

        const exercises: Array<unknown> = [];

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-2' } },
        } as never);

        type ButtonProps = React.ComponentProps<typeof Button>;
        const buttons = findElementsByType(element, Button) as Array<React.ReactElement<ButtonProps>>;
        const finishButton = buttons.find((button) => button.props.title === 'Finish workout');

        expect(finishButton?.props.variant).toBe('primary');
        finishButton?.props.onPress?.({} as never);

        const { Alert } = jest.requireMock('react-native');
        expect(Alert.alert).toHaveBeenCalledWith(
            'Finish workout?',
            'This will mark the session as completed.',
            expect.any(Array),
        );
    });

    it('does not render the overall sets counter in the header', () => {
        const session = {
            id: 'session-3',
            title: 'Pull Day',
            status: 'in_progress',
            started_at: '2024-01-03T00:00:00Z',
            rest_timer_end_at: null,
            rest_timer_seconds: null,
            rest_timer_label: null,
        };

        const exercises: Array<unknown> = [];

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-3' } },
        } as never);

        type TextProps = React.ComponentProps<typeof Text>;
        const texts = findElementsByType(element, Text) as Array<React.ReactElement<TextProps>>;
        const setsLabel = texts.find((text) => text.props.children === 'Sets');

        expect(setsLabel).toBeUndefined();
    });

    it('renders the rest timer overlay outside the scroll view when active', () => {
        const session = {
            id: 'session-4',
            title: 'Conditioning',
            status: 'in_progress',
            started_at: '2024-01-04T00:00:00Z',
            rest_timer_end_at: '2024-01-04T00:01:00Z',
            rest_timer_seconds: 60,
            rest_timer_label: 'Row',
        };

        const exercises: Array<unknown> = [];

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: 'session-4' } },
        } as never);

        type CardProps = React.ComponentProps<typeof Card>;
        const allCards = findElementsByType(element, Card) as Array<React.ReactElement<CardProps>>;
        const overlayCard = allCards.find((card) => getPositionStyle(card.props.style) === 'absolute');

        expect(overlayCard).toBeDefined();

        const scrollViews = findElementsByType(element, 'ScrollView') as Array<
            React.ReactElement<{ children?: React.ReactNode }>
        >;
        const scrollCards = scrollViews.flatMap((scrollView) =>
        (findElementsByType(scrollView.props.children, Card) as Array<
            React.ReactElement<CardProps>
        >),
        );

        const scrollOverlayCard = scrollCards.find(
            (card) => getPositionStyle(card.props.style) === 'absolute',
        );
        expect(scrollOverlayCard).toBeUndefined();

        const icons = findElementsByType(element, 'Ionicons') as Array<
            React.ReactElement<{ name: string; color?: string }>
        >;
        const trashIcon = icons.find((icon) => icon.props.name === 'trash-outline');
        expect(trashIcon?.props.color).toBe(tokens.colors.destructive);
    });

    it('styles completed set rows and destructive icons', () => {
        const element = (
            <SetRow
                set={{
                    id: 'set-9',
                    workout_session_exercise_id: 'exercise-1',
                    set_index: 1,
                    weight: 100,
                    reps: 5,
                    rpe: null,
                    rest_seconds: 90,
                    notes: null,
                    is_completed: 1,
                }}
                onWeightEndEditing={jest.fn()}
                onRepsEndEditing={jest.fn()}
                onToggleComplete={jest.fn()}
                onDelete={jest.fn()}
            />
        );

        const views = findElementsByType(element, 'View') as Array<
            React.ReactElement<{ style?: StyleProp<ViewStyle> }>
        >;
        const rowStyle = StyleSheet.flatten(views[0]?.props.style) as ViewStyle | undefined;
        expect(rowStyle?.backgroundColor).toBe(tokens.colors.successSurface);
        expect(rowStyle?.borderColor).toBe(tokens.colors.success);

        const pressables = findElementsByType(element, 'Pressable') as Array<
            React.ReactElement<{ style?: unknown }>
        >;
        const checkStyle = StyleSheet.flatten(resolveStyle(pressables[0]?.props.style)) as
            | ViewStyle
            | undefined;
        expect(checkStyle?.backgroundColor).toBe(tokens.colors.success);
        expect(checkStyle?.borderColor).toBe(tokens.colors.success);

        const texts = findElementsByType(element, Text) as Array<
            React.ReactElement<{ children?: React.ReactNode }>
        >;
        expect(texts[0]?.props.children).toBe(1);
        expect(texts.some((text) => text.props.children === 'kg')).toBe(false);
        expect(texts.some((text) => text.props.children === 'reps')).toBe(false);
        expect(texts.some((text) => text.props.children === 'Set 1')).toBe(false);

        const icons = findElementsByType(element, 'Ionicons') as Array<
            React.ReactElement<{ name: string; color?: string }>
        >;
        const trashIcon = icons.find((icon) => icon.props.name === 'trash-outline');
        expect(trashIcon?.props.color).toBe(tokens.colors.destructive);
    });

    it('renders the add set row inside the exercise card and triggers onAddSet', () => {
        const onAddSet = jest.fn();
        const element = (
            <ExerciseCard name="Squat" subtitle="0/1 sets complete" onAddSet={onAddSet}>
                <Text>Set row</Text>
            </ExerciseCard>
        );

        const pressables = findElementsByType(element, 'Pressable') as Array<
            React.ReactElement<{ onPress?: () => void; testID?: string }>
        >;
        const addSetRow = pressables.find((pressable) => pressable.props.testID === 'exercise-card-add-set');

        expect(addSetRow).toBeDefined();
        addSetRow?.props.onPress?.();
        expect(onAddSet).toHaveBeenCalled();
    });
    it('renders column headers once per exercise card', () => {
        const element = (
            <ExerciseCard name="Deadlift" subtitle="0/2 sets complete" onAddSet={jest.fn()}>
                <SetRow
                    set={{
                        id: 'set-1',
                        workout_session_exercise_id: 'exercise-1',
                        set_index: 1,
                        weight: 120,
                        reps: 5,
                        rpe: null,
                        rest_seconds: 90,
                        notes: null,
                        is_completed: 0,
                    }}
                    onWeightEndEditing={jest.fn()}
                    onRepsEndEditing={jest.fn()}
                    onToggleComplete={jest.fn()}
                    onDelete={jest.fn()}
                />
                <SetRow
                    set={{
                        id: 'set-2',
                        workout_session_exercise_id: 'exercise-1',
                        set_index: 2,
                        weight: 120,
                        reps: 5,
                        rpe: null,
                        rest_seconds: 90,
                        notes: null,
                        is_completed: 0,
                    }}
                    onWeightEndEditing={jest.fn()}
                    onRepsEndEditing={jest.fn()}
                    onToggleComplete={jest.fn()}
                    onDelete={jest.fn()}
                />
            </ExerciseCard>
        );

        const texts = findElementsByType(element, Text) as Array<
            React.ReactElement<{ children?: React.ReactNode }>
        >;
        const setLabels = texts.filter((text) => text.props.children === 'SET');
        const weightLabels = texts.filter((text) => text.props.children === 'WEIGHT');
        const repLabels = texts.filter((text) => text.props.children === 'REPS');

        expect(setLabels).toHaveLength(1);
        expect(weightLabels).toHaveLength(1);
        expect(repLabels).toHaveLength(1);
    });
});
