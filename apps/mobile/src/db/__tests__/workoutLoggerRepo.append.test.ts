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
import { appendWorkoutSessionExercise } from '../workoutLoggerRepo';

describe('appendWorkoutSessionExercise', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset().mockReturnValueOnce('wse-new').mockReturnValueOnce('set-new');
  });

  it('appends exercise to the end with one default set', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ max_position: 4 }])
      .mockReturnValueOnce([{ id: 'wse-new' }])
      .mockReturnValueOnce([{ id: 'set-new' }]);

    const result = appendWorkoutSessionExercise({
      workoutSessionId: 'ws-1',
      exerciseId: 'ex-7',
      exerciseName: 'Chest Supported Row',
    });

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-new', 'ws-1', 'ex-7', 'Chest Supported Row', 'strength', null, 5],
    );
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('VALUES (?, ?, 1, 0, 0, NULL, ?, NULL, 0);'),
      ['set-new', 'wse-new', 90],
    );
    expect(result.focusExerciseId).toBe('wse-new');
  });

  it('keeps append session-only by nulling source planned slot identity', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ max_position: null }])
      .mockReturnValueOnce([{ id: 'wse-new' }])
      .mockReturnValueOnce([{ id: 'set-new' }]);

    appendWorkoutSessionExercise({
      workoutSessionId: 'ws-1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
    });

    const sqlStatements = (exec as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(sqlStatements.some((sql) => sql.includes('planned_set'))).toBe(false);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('source_program_day_exercise_id'), [
      'wse-new',
      'ws-1',
      'ex-1',
      'Bench Press',
      'strength',
      null,
      1,
    ]);
  });

  it('allows duplicate exercises in the same workout session', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ max_position: 2 }])
      .mockReturnValueOnce([{ id: 'wse-new' }])
      .mockReturnValueOnce([{ id: 'set-new' }]);

    expect(() =>
      appendWorkoutSessionExercise({
        workoutSessionId: 'ws-1',
        exerciseId: 'ex-2',
        exerciseName: 'Incline Dumbbell Press',
      }),
    ).not.toThrow();

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-new', 'ws-1', 'ex-2', 'Incline Dumbbell Press', 'strength', null, 3],
    );
  });
});
