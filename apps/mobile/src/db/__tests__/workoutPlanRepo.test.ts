jest.mock('../db', () => ({
    exec: jest.fn(),
    query: jest.fn(),
}));

jest.mock('../tx', () => ({
    inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../../utils/ids', () => ({
    newId: jest.fn(() => 'day-3'),
}));

import { exec, query } from '../db';
import { addDayToWorkoutPlan } from '../workoutPlanRepo';

describe('workoutPlanRepo addDayToWorkoutPlan', () => {
    beforeEach(() => {
        (exec as jest.Mock).mockReset();
        (query as jest.Mock).mockReset();
    });

    it('creates newly added days with Session N default naming', () => {
        (query as jest.Mock).mockImplementation((sql: string) => {
            if (sql.includes('FROM program_week') && sql.includes('LIMIT 1')) return [{ id: 'week-1' }];
            if (sql.includes('FROM program_day') && sql.includes('deleted_at IS NOT NULL')) return [];
            if (sql.includes('SELECT id, name') && sql.includes('deleted_at IS NULL')) {
                return [
                    { id: 'day-1', name: 'Session 1' },
                    { id: 'day-2', name: 'Upper Body' },
                ];
            }
            if (sql.includes('COUNT(*) AS n')) return [{ n: 2 }];
            return [];
        });

        addDayToWorkoutPlan('plan-1');

        const insertCall = (exec as jest.Mock).mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO program_day'),
        );
        expect(insertCall?.[1]).toEqual(['day-3', 'week-1', 3, 'Session 3']);
    });
});