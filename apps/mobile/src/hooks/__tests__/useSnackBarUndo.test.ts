let storedState: unknown;
let storedRef: { current: ReturnType<typeof setTimeout> | null };

jest.mock('react', () => {
    const actual = jest.requireActual('react');
    return {
        ...actual,
        useState: jest.fn((initial: unknown) => {
            if (storedState === undefined) {
                storedState = typeof initial === 'function' ? initial() : initial;
            }
            const setState = (value: unknown) => {
                storedState =
                    typeof value === 'function'
                        ? (value as (prev: unknown) => unknown)(storedState)
                        : value;
            };
            return [storedState, setState];
        }),
        useRef: jest.fn(() => storedRef),
        useEffect: jest.fn(),
        useCallback: (fn: () => unknown) => fn,
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
        storedState = undefined;
        storedRef = { current: null };
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