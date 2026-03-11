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

jest.mock('../prRepo', () => ({
    detectAndStorePrsForSession: jest.fn(),
}));

jest.mock('../../utils/ids', () => ({
    newId: jest.fn(),
}));

import { exec, query } from '../db';
import { newId } from '../../utils/ids';
import { createSessionFromPlanDay } from '../workoutSessionRepo';

type Scenario = {
    exercises: Array<{
        dayExerciseId: string;
        exerciseId: string;
        exerciseName: string;
        position: number;
        plannedSets: Array<{ set_index: number; target_reps_min: number | null; rest_seconds: number | null }>;
        historicalSets: Array<{ weight: number; reps: number; rest_seconds: number }>;
    }>;
};

function setupScenario(scenario: Scenario) {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
            return [];
        }
        if (sql.includes('FROM program_day') && sql.includes('LIMIT 1')) {
            return [{ day_name: 'Push Day', day_index: 1 }];
        }
        if (sql.includes('FROM program_day_exercise pde')) {
            return scenario.exercises.map((exercise) => ({
                day_exercise_id: exercise.dayExerciseId,
                exercise_id: exercise.exerciseId,
                exercise_name: exercise.exerciseName,
                position: exercise.position,
            }));
        }
        if (sql.includes('FROM planned_set')) {
            const exercise = scenario.exercises.find((item) => item.dayExerciseId === params?.[0]);
            return exercise?.plannedSets ?? [];
        }
        if (sql.includes('SELECT hs.weight, hs.reps, hs.rest_seconds')) {
            const exercise = scenario.exercises.find((item) => item.dayExerciseId === params?.[2]);
            return exercise?.historicalSets ?? [];
        }
        if (sql.includes('FROM workout_session_exercise') && sql.includes('LIMIT 1')) {
            return [{ id: params?.[0] }];
        }
        if (sql.includes('FROM workout_set') && sql.includes('LIMIT 1')) {
            return [{ id: params?.[0] }];
        }
        if (sql.includes('FROM workout_session') && sql.includes('WHERE id = ?')) {
            return [{ id: params?.[0] }];
        }
        return [];
    });
}

describe('createSessionFromPlanDay prefill', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
        (newId as jest.Mock).mockReset();
    });

    it('prefills from most recent completed same-plan-day history and preserves exact values', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [
                        { set_index: 1, target_reps_min: 8, rest_seconds: 120 },
                        { set_index: 2, target_reps_min: 8, rest_seconds: 120 },
                        { set_index: 3, target_reps_min: 8, rest_seconds: 120 },
                    ],
                    historicalSets: [
                        { weight: 60, reps: 8, rest_seconds: 105 },
                        { weight: 60, reps: 8, rest_seconds: 110 },
                        { weight: 55, reps: 10, rest_seconds: 120 },
                    ],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1')
            .mockReturnValueOnce('set-2')
            .mockReturnValueOnce('set-3');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const setInserts = (exec as jest.Mock).mock.calls.filter((call) =>
            String(call[0]).includes('INSERT INTO workout_set'),
        );

        expect(setInserts).toHaveLength(3);
        expect(setInserts[0][1]).toEqual(['set-1', 'wse-1', 1, 60, 8, 105]);
        expect(setInserts[1][1]).toEqual(['set-2', 'wse-1', 2, 60, 8, 110]);
        expect(setInserts[2][1]).toEqual(['set-3', 'wse-1', 3, 55, 10, 120]);
    });

    it('matches by planned exercise identity and ignores row position noise', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 2,
                    plannedSets: [{ set_index: 1, target_reps_min: 8, rest_seconds: 120 }],
                    historicalSets: [{ weight: 72.5, reps: 5, rest_seconds: 90 }],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const historyQuery = (query as jest.Mock).mock.calls.find((call) =>
            String(call[0]).includes('SELECT hs.weight, hs.reps, hs.rest_seconds'),
        );
        expect(historyQuery?.[1]).toEqual(['day-1', 'bench', 'pde-bench', 'day-1', 'bench', 'pde-bench']);
    });

    it('is eligible to immediately reuse a just-completed same-day session for prefill lookup', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [{ set_index: 1, target_reps_min: 8, rest_seconds: 120 }],
                    historicalSets: [{ weight: 77.5, reps: 5, rest_seconds: 150 }],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const historySql = String(
            (query as jest.Mock).mock.calls.find((call) =>
                String(call[0]).includes('SELECT hws2.id'),
            )?.[0] ?? '',
        );

        expect(historySql).toContain("hws2.status = 'completed'");
        expect(historySql).toContain('ORDER BY COALESCE(hws2.ended_at, hws2.started_at) DESC, hws2.started_at DESC');
        expect(historySql).not.toContain('hws2.ended_at IS NOT NULL');
    });

    it('keeps plan defaults for sets not present in history', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [
                        { set_index: 1, target_reps_min: 8, rest_seconds: 120 },
                        { set_index: 2, target_reps_min: 6, rest_seconds: 150 },
                        { set_index: 3, target_reps_min: 10, rest_seconds: 180 },
                        { set_index: 4, target_reps_min: 12, rest_seconds: 210 },
                    ],
                    historicalSets: [
                        { weight: 60, reps: 8, rest_seconds: 90 },
                        { weight: 62.5, reps: 6, rest_seconds: 95 },
                    ],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1')
            .mockReturnValueOnce('set-2')
            .mockReturnValueOnce('set-3')
            .mockReturnValueOnce('set-4');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const setInserts = (exec as jest.Mock).mock.calls.filter((call) =>
            String(call[0]).includes('INSERT INTO workout_set'),
        );

        expect(setInserts).toHaveLength(4);
        expect(setInserts[2][1]).toEqual(['set-3', 'wse-1', 3, 0, 10, 180]);
        expect(setInserts[3][1]).toEqual(['set-4', 'wse-1', 4, 0, 12, 210]);
    });

    it('grows session set count when completed history has more sets than plan', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [
                        { set_index: 1, target_reps_min: 8, rest_seconds: 120 },
                        { set_index: 2, target_reps_min: 8, rest_seconds: 120 },
                        { set_index: 3, target_reps_min: 8, rest_seconds: 120 },
                    ],
                    historicalSets: [
                        { weight: 60, reps: 8, rest_seconds: 100 },
                        { weight: 60, reps: 8, rest_seconds: 100 },
                        { weight: 57.5, reps: 8, rest_seconds: 100 },
                        { weight: 55, reps: 10, rest_seconds: 100 },
                    ],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1')
            .mockReturnValueOnce('set-2')
            .mockReturnValueOnce('set-3')
            .mockReturnValueOnce('set-4');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const setInserts = (exec as jest.Mock).mock.calls.filter((call) =>
            String(call[0]).includes('INSERT INTO workout_set'),
        );

        expect(setInserts).toHaveLength(4);
        expect(setInserts[3][1]).toEqual(['set-4', 'wse-1', 4, 55, 10, 100]);
    });


    it('uses only completed sets and source planned slot identity to avoid swap pollution', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [{ set_index: 1, target_reps_min: 8, rest_seconds: 120 }],
                    historicalSets: [{ weight: 80, reps: 3, rest_seconds: 180 }],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const historySql = String(
            (query as jest.Mock).mock.calls.find((call) => String(call[0]).includes('SELECT hs.weight, hs.reps, hs.rest_seconds'))?.[0] ??
            '',
        );

        expect(historySql).toContain('hs.is_completed = 1');
        expect(historySql).toContain('hwse.source_program_day_exercise_id = ?');
    });

    it('uses pure plan defaults when no history exists', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [
                        { set_index: 1, target_reps_min: 5, rest_seconds: 150 },
                        { set_index: 2, target_reps_min: 5, rest_seconds: 150 },
                        { set_index: 3, target_reps_min: 5, rest_seconds: 150 },
                    ],
                    historicalSets: [],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1')
            .mockReturnValueOnce('set-2')
            .mockReturnValueOnce('set-3');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const setInserts = (exec as jest.Mock).mock.calls.filter((call) =>
            String(call[0]).includes('INSERT INTO workout_set'),
        );

        expect(setInserts).toHaveLength(3);
        expect(setInserts[0][1]).toEqual(['set-1', 'wse-1', 1, 0, 5, 150]);
        expect(setInserts[2][1]).toEqual(['set-3', 'wse-1', 3, 0, 5, 150]);
    });
    it('uses per-set plan default reps when history is missing (not set row index)', () => {
        setupScenario({
            exercises: [
                {
                    dayExerciseId: 'pde-bench',
                    exerciseId: 'bench',
                    exerciseName: 'Bench',
                    position: 1,
                    plannedSets: [
                        { set_index: 1, target_reps_min: 5, rest_seconds: 120 },
                        { set_index: 2, target_reps_min: 8, rest_seconds: 135 },
                        { set_index: 3, target_reps_min: 12, rest_seconds: 150 },
                    ],
                    historicalSets: [],
                },
            ],
        });

        (newId as jest.Mock)
            .mockReturnValueOnce('ws-1')
            .mockReturnValueOnce('wse-1')
            .mockReturnValueOnce('set-1')
            .mockReturnValueOnce('set-2')
            .mockReturnValueOnce('set-3');

        createSessionFromPlanDay({ workoutPlanId: 'plan-1', dayId: 'day-1' });

        const setInserts = (exec as jest.Mock).mock.calls.filter((call) =>
            String(call[0]).includes('INSERT INTO workout_set'),
        );

        expect(setInserts).toHaveLength(3);
        expect(setInserts[0][1]).toEqual(['set-1', 'wse-1', 1, 0, 5, 120]);
        expect(setInserts[1][1]).toEqual(['set-2', 'wse-1', 2, 0, 8, 135]);
        expect(setInserts[2][1]).toEqual(['set-3', 'wse-1', 3, 0, 12, 150]);
    });
});