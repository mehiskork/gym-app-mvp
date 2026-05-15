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
import { enqueueOutboxOp } from '../outboxRepo';
import { newId } from '../../utils/ids';
import { createQuickWorkoutSession } from '../workoutSessionRepo';

describe('createQuickWorkoutSession', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset();
  });

  it('creates an in-progress workout session without plan source rows and enqueues it', () => {
    (newId as jest.Mock).mockReturnValue('ws-quick-1');
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
        return [];
      }
      if (sql.includes('FROM workout_session') && sql.includes('WHERE id = ?')) {
        return [
          {
            id: params?.[0],
            source_workout_plan_id: null,
            source_program_day_id: null,
            title: 'Quick Workout',
            status: 'in_progress',
            started_at: '2026-05-15 10:00:00',
            ended_at: null,
            workout_note: null,
            deleted_at: null,
          },
        ];
      }
      return [];
    });

    const sessionId = createQuickWorkoutSession();

    expect(sessionId).toBe('ws-quick-1');

    const sessionInserts = (exec as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO workout_session'),
    );
    const sessionExerciseInserts = (exec as jest.Mock).mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO workout_session_exercise'),
    );

    expect(sessionInserts).toHaveLength(1);
    expect(String(sessionInserts[0][0])).toContain('source_workout_plan_id');
    expect(String(sessionInserts[0][0])).toContain('source_program_day_id');
    expect(String(sessionInserts[0][0])).toContain("'in_progress'");
    expect(String(sessionInserts[0][0])).toContain('datetime');
    expect(sessionInserts[0][1]).toEqual(['ws-quick-1', 'Quick Workout']);
    expect(sessionExerciseInserts).toHaveLength(0);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session',
        entityId: 'ws-quick-1',
        opType: 'upsert',
        payloadJson: expect.stringContaining('"source_workout_plan_id":null'),
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.stringContaining('"source_program_day_id":null'),
      }),
    );
  });

  it('throws existing-style error and does not create a second in-progress session', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'active-session-1' }]);

    expect(() => createQuickWorkoutSession()).toThrow('WORKOUT_IN_PROGRESS:active-session-1');
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });
});
