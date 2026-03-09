jest.mock('../db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../tx', () => ({
    inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../outboxRepo', () => ({
    enqueueOutboxOp: jest.fn(),
}));

jest.mock('../../utils/ids', () => ({
    newId: jest
        .fn()
        .mockReturnValueOnce('wse-inserted')
        .mockReturnValueOnce('set-inserted'),
}));

import { exec, query } from '../db';
import { swapWorkoutSessionExercise } from '../workoutLoggerRepo';

describe('swapWorkoutSessionExercise', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
    });

    it('replaces exercise in place when no completed sets exist', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ id: 'wse-1', position: 2 }])
            .mockReturnValueOnce([{ n: 0 }])
            .mockReturnValueOnce([{ id: 'wse-1' }]);

        const result = swapWorkoutSessionExercise({
            workoutSessionId: 'ws-1',
            workoutSessionExerciseId: 'wse-1',
            replacementExerciseId: 'ex-2',
            replacementExerciseName: 'Incline Bench Press',
        });

        expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE workout_session_exercise'), [
            'ex-2',
            'Incline Bench Press',
            'wse-1',
        ]);
        expect(result.focusExerciseId).toBe('wse-1');
    });

    it('inserts replacement below when completed sets exist', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ id: 'wse-1', position: 2 }])
            .mockReturnValueOnce([{ n: 1 }])
            .mockReturnValueOnce([{ id: 'wse-inserted' }])
            .mockReturnValueOnce([{ id: 'set-inserted' }]);

        const result = swapWorkoutSessionExercise({
            workoutSessionId: 'ws-1',
            workoutSessionExerciseId: 'wse-1',
            replacementExerciseId: 'ex-2',
            replacementExerciseName: 'Incline Bench Press',
        });

        expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET position = position + 1'), ['ws-1', 2]);
        expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workout_session_exercise'), [
            'wse-inserted',
            'ws-1',
            'ex-2',
            'Incline Bench Press',
            3,
        ]);
        expect(result.focusExerciseId).toBe('wse-inserted');
    });
});