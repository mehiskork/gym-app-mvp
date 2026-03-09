jest.mock('../db', () => ({ exec: jest.fn(), query: jest.fn() }));
jest.mock('../sessionDetailRepo', () => ({
    fetchSessionDetail: jest.fn(),
}));

import { fetchSessionDetail } from '../sessionDetailRepo';
import { getSessionDetail } from '../historyRepo';

describe('historyRepo getSessionDetail', () => {
    it('returns only exercises that have logged sets', () => {
        (fetchSessionDetail as jest.Mock).mockReturnValue({
            session: {
                id: 's1',
                title: 'Push',
                started_at: '2026-01-01',
                ended_at: '2026-01-01',
            },
            exercises: [
                {
                    id: 'wse-1',
                    exercise_id: 'ex-1',
                    exercise_name: 'Bench Press',
                    position: 1,
                    sets: [],
                },
                {
                    id: 'wse-2',
                    exercise_id: 'ex-2',
                    exercise_name: 'Incline Bench Press',
                    position: 2,
                    sets: [
                        {
                            id: 'set-1',
                            workout_session_exercise_id: 'wse-2',
                            set_index: 1,
                            weight: 100,
                            reps: 8,
                            rpe: null,
                            rest_seconds: 90,
                            notes: null,
                            is_completed: 1,
                        },
                    ],
                },
            ],
        });

        const detail = getSessionDetail('s1');

        expect(detail?.exercises).toEqual([
            {
                id: 'wse-2',
                exercise_id: 'ex-2',
                exercise_name: 'Incline Bench Press',
                position: 2,
            },
        ]);
        expect(detail?.sets).toHaveLength(1);
    });
});