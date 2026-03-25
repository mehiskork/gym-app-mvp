jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn(),
        useContext: jest.fn(() => ({
            primaryColorKey: 'blue',
            setPrimaryColorKey: jest.fn(),
            colors: new Proxy({}, { get: () => '#000000' }),
        })),
        useCallback: (fn: () => unknown) => fn,
        useMemo: (fn: () => unknown) => fn(),
        useEffect: jest.fn(),
        useRef: () => ({ current: null }),
    };
});

jest.mock('@react-navigation/native', () => ({
    CommonActions: {
        reset: jest.fn((payload: unknown) => ({ type: 'RESET', payload })),
    },
    useFocusEffect: jest.fn(),
    useIsFocused: () => true,
}));

jest.mock('expo-haptics', () => ({
    selectionAsync: jest.fn(),
}));

jest.mock(
    'expo-keep-awake',
    () => ({
        activateKeepAwakeAsync: jest.fn(),
        deactivateKeepAwake: jest.fn(),
    }),
    { virtual: true },
);

jest.mock('react-native', () => {
    const React = require('react');
    return {
        KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('KeyboardAvoidingView', props, children),
        Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('Pressable', props, children),
        ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('ScrollView', props, children),
        Modal: ({ children, visible, ...props }: { children?: React.ReactNode; visible?: boolean }) =>
            visible ? React.createElement('Modal', props, children) : null,
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

        Platform: { OS: 'ios', select: () => 'monospace' },
        Alert: { alert: jest.fn() },
    };
});

jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    return {
        SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
            React.createElement('SafeAreaView', props, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
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
    updateWorkoutSessionNote: jest.fn(),
}));

jest.mock('../../db/settingsRepo', () => ({
    getSettings: jest.fn(),
}));

jest.mock('../../utils/restTimerNotifications', () => ({
    cancelRestTimerNotification: jest.fn(),
    scheduleRestTimerNotification: jest.fn(),
}));

import React from 'react';
import { CommonActions } from '@react-navigation/native';

import { WorkoutSessionScreen } from '../WorkoutSessionScreen';
import { TAB_ROUTES } from '../../navigation/routes';
import { Button, Input, Text } from '../../ui';
import { clearRestTimer, getWorkoutLoggerData } from '../../db/workoutLoggerRepo';
import { completeSession, updateWorkoutSessionNote } from '../../db/workoutSessionRepo';
import { getSettings } from '../../db/settingsRepo';

type Nav = {
    navigate: jest.Mock;
    dispatch: jest.Mock;
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

const setupBaseState = (options?: {
    finishOpen?: boolean;
    exercises?: Array<unknown>;
    session?: { started_at: string; id: string; title: string; status: string; workout_note: string | null };
}) => {
    const session =
        options?.session ??
        ({
            id: 'session-5',
            title: 'Strength',
            status: 'in_progress',
            started_at: '2024-01-01T00:00:00Z',
            rest_timer_end_at: null,
            rest_timer_seconds: null,
            rest_timer_label: null,
            workout_note: '',
        } as const);

    const exercises =
        options?.exercises ??
        [
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
                        is_completed: 1,
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

    return { session, exercises };
};

describe('WorkoutSessionScreen finish modal', () => {
    const useStateMock = React.useState as jest.Mock;

    beforeEach(() => {
        useStateMock.mockReset();
        useStateMock.mockImplementation((initial: unknown) => [initial, jest.fn()]);
        (getWorkoutLoggerData as jest.Mock).mockReset();
        (completeSession as jest.Mock).mockReset();
        (updateWorkoutSessionNote as jest.Mock).mockReset();
        (clearRestTimer as jest.Mock).mockReset();
        (getSettings as jest.Mock).mockReturnValue({
            defaultRestSeconds: 120,
            autoStartRestTimer: true,
            restTimerVibration: true,
            keepScreenOn: true,
            restTimerNotifications: false,
        });
        (CommonActions.reset as jest.Mock).mockClear();
    });

    it('opens the finish sheet when tapping Finish workout', () => {
        const { session, exercises } = setupBaseState();
        const setFinishOpen = jest.fn();

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [false, setFinishOpen]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const buttons = findElementsByType(element, Button) as Array<React.ReactElement<React.ComponentProps<typeof Button>>>;
        const finishButton = buttons.find((button) => button.props.title === 'Finish workout');

        finishButton?.props.onPress?.({} as never);
        expect(setFinishOpen).toHaveBeenCalledWith(true);
    });

    it('shows completed sets and formatted duration', () => {
        const { session, exercises } = setupBaseState();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T02:11:00Z').getTime());

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const texts = findElementsByType(element, Text) as Array<React.ReactElement<{ children?: React.ReactNode }>>;
        expect(texts.some((text) => text.props.children === 1)).toBe(true);
        expect(texts.some((text) => text.props.children === '2h 11m')).toBe(true);

        nowSpy.mockRestore();
    });

    it('renders warning text only when sets are incomplete', () => {
        const { session, exercises } = setupBaseState();

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const texts = findElementsByType(element, Text) as Array<React.ReactElement<{ children?: React.ReactNode }>>;
        expect(texts.some((text) => text.props.children === 'You have 1 incomplete sets. Finish anyway?')).toBe(true);
        expect(texts.some((text) => text.props.children === 'Finish and save this workout?')).toBe(false);
    });

    it('closes when Keep Training is pressed and finishes when Finish is pressed', () => {
        const { session, exercises } = setupBaseState({
            exercises: [
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
                            is_completed: 1,
                        },
                    ],
                },
            ],
        });

        const setFinishOpen = jest.fn();
        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [true, setFinishOpen]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [{ visible: false, payload: null }, jest.fn()]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const buttons = findElementsByType(element, Button) as Array<React.ReactElement<React.ComponentProps<typeof Button>>>;
        const keepButton = buttons.find((button) => button.props.title === 'Keep Training');
        const finishButton = buttons.find((button) => button.props.title === 'Finish');

        keepButton?.props.onPress?.({} as never);
        expect(setFinishOpen).toHaveBeenCalledWith(false);

        finishButton?.props.onPress?.({} as never);
        expect(completeSession).toHaveBeenCalledWith(session.id, '');
        expect(clearRestTimer).toHaveBeenCalledWith(session.id);
        expect(CommonActions.reset).toHaveBeenCalledWith({
            index: 0,
            routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
        });
        expect(navigation.dispatch).toHaveBeenCalledWith({
            type: 'RESET',
            payload: {
                index: 0,
                routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
            },
        });
    });

    it('passes workout note to completeSession when finishing', () => {
        const { session, exercises } = setupBaseState();

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['Felt strong today', jest.fn()]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const buttons = findElementsByType(element, Button) as Array<React.ReactElement<React.ComponentProps<typeof Button>>>;
        const finishButton = buttons.find((button) => button.props.title === 'Finish');

        finishButton?.props.onPress?.({} as never);
        expect(completeSession).toHaveBeenCalledWith(session.id, 'Felt strong today');
    });

    it('updates workout note draft, enforces 200 chars, and reuses draft on reopen', () => {
        const longNote = 'x'.repeat(250);
        const { session, exercises } = setupBaseState({
            session: {
                id: 'session-5',
                title: 'Strength',
                status: 'in_progress',
                started_at: '2024-01-01T00:00:00Z',
                workout_note: 'Existing draft',
            },
        });

        const setWorkoutNoteDraft = jest.fn();

        useStateMock.mockImplementationOnce(() => [session, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [exercises, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [
            {
                defaultRestSeconds: 120,
                autoStartRestTimer: true,
                restTimerVibration: true,
                keepScreenOn: true,
                restTimerNotifications: false,
            },
            jest.fn(),
        ]);
        useStateMock.mockImplementationOnce(() => [true, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [false, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [0, jest.fn()]);
        useStateMock.mockImplementationOnce(() => [null, jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['', jest.fn()]);
        useStateMock.mockImplementationOnce(() => ['Existing draft', setWorkoutNoteDraft]);

        (getWorkoutLoggerData as jest.Mock).mockReturnValue({ session, exercises });

        const navigation: Nav = { navigate: jest.fn(), dispatch: jest.fn(), setOptions: jest.fn() };
        const element = WorkoutSessionScreen({
            navigation,
            route: { key: 'WorkoutSession', name: 'WorkoutSession', params: { sessionId: session.id } },
        } as never);

        const inputs = findElementsByType(element, Input) as Array<
            React.ReactElement<{ label?: string; onChangeText?: (value: string) => void }>
        >;

        const noteInput = inputs.find((input) => input.props.label === 'Workout note (optional)');
        expect(noteInput).toBeDefined();

        noteInput?.props.onChangeText?.(longNote);

        expect(setWorkoutNoteDraft).toHaveBeenCalledWith('x'.repeat(200));
        expect(updateWorkoutSessionNote).toHaveBeenCalledWith(session.id, 'x'.repeat(200));
    });
});
