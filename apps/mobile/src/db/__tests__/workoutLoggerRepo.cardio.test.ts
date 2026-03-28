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
    newId: jest.fn(),
}));

import { exec, query } from '../db';
import { newId } from '../../utils/ids';
import { appendWorkoutSessionExercise, updateWorkoutSessionExerciseCardioSummary } from '../workoutLoggerRepo';

describe('workoutLoggerRepo cardio', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
        (newId as jest.Mock).mockReset().mockReturnValue('wse-new');
    });

    it('appends cardio exercise without inserting strength set rows', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ exercise_type: 'cardio', cardio_profile: 'treadmill' }])
            .mockReturnValueOnce([{ id: 'ws-1' }])
            .mockReturnValueOnce([{ max_position: 2 }])
            .mockReturnValueOnce([{ id: 'wse-new' }]);

        appendWorkoutSessionExercise({
            workoutSessionId: 'ws-1',
            exerciseId: 'ex_treadmill_run',
            exerciseName: 'Treadmill',
        });

        const sqlStatements = (exec as jest.Mock).mock.calls.map((call) => String(call[0]));
        expect(sqlStatements.some((sql) => sql.includes('INSERT INTO workout_set'))).toBe(false);
        expect(sqlStatements.some((sql) => sql.includes('exercise_type'))).toBe(true);
    });

    it('updates cardio summary only for cardio in-progress exercises', () => {
        (query as jest.Mock)
            .mockReturnValueOnce([{ status: 'in_progress', exercise_type: 'cardio' }])
            .mockReturnValueOnce([{ id: 'wse-1' }]);

        updateWorkoutSessionExerciseCardioSummary('wse-1', {
            duration_minutes: 20,
            distance_km: 4.2,
        });

        expect(exec).toHaveBeenCalledWith(
            expect.stringContaining('cardio_duration_minutes = ?, cardio_distance_km = ?'),
            [20, 4.2, 'wse-1'],
        );
    });
});