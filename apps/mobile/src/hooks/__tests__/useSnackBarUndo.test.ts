let mockStoredState: unknown;
let mockStoredRef: { current: ReturnType<typeof setTimeout> | null };

jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn((initial: unknown) => {
            if (mockStoredState === undefined) {
                mockStoredState = typeof initial === 'function' ? (initial as any)() : initial;
            }
            const setState = (value: unknown) => {
                mockStoredState =
                    typeof value === 'function'
                        ? (value as any)(mockStoredState)
                        : value;
            };
            return [mockStoredState, setState];
        }),
        useRef: jest.fn(() => mockStoredRef),
        useEffect: jest.fn(),
        useCallback: (fn: any) => fn,
    };
});


import { useSnackbarUndo } from '../useSnackbarUndo';

const createPayload = () => ({
    id: 'set-1',
    workout_session_exercise_id: 'exercise-1',
    set_index: 1,
    weight: 100,
    reps: 8,
    rpe: null,
    rest_seconds: 90,
    notes: null,
    is_completed: 0,
});

describe('useSnackbarUndo', () => {
    beforeEach(() => {
        mockStoredState = undefined;
        mockStoredRef = { current: null };
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows the snackbar on delete and hides after timeout', () => {
        const onUndo = jest.fn();
        const payload = createPayload();

        const hook = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        expect(hook.visible).toBe(false);

        hook.showUndo(payload);

        const afterShow = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        expect(afterShow.visible).toBe(true);

        jest.advanceTimersByTime(1000);

        const afterTimeout = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        expect(afterTimeout.visible).toBe(false);
    });

    it('undo restores the payload and hides the snackbar', () => {
        const onUndo = jest.fn();
        const payload = createPayload();

        const hook = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        hook.showUndo(payload);

        const afterShow = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        afterShow.onUndoAction();

        expect(onUndo).toHaveBeenCalledWith(payload);

        const afterUndo = useSnackbarUndo({ onUndo, timeoutMs: 1000 });
        expect(afterUndo.visible).toBe(false);
    });
});
