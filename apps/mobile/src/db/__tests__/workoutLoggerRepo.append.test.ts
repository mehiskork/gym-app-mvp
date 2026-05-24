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
import { enqueueOutboxOp } from '../outboxRepo';
import { appendWorkoutSessionExercise } from '../workoutLoggerRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  WorkoutLimitError,
  WORKOUT_LIMIT_MESSAGES,
} from '../workoutLimits';

describe('appendWorkoutSessionExercise', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset().mockReturnValueOnce('wse-new').mockReturnValueOnce('set-new');
  });

  it('appends exercise to the end with one default set', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: 4 }])
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
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
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: 0 }])
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
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
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: 2 }])
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
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

  it('allows adding the 50th active exercise', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: MAX_EXERCISES_PER_SESSION - 1 }])
      .mockReturnValueOnce([{ exercise_type: 'strength', cardio_profile: null }])
      .mockReturnValueOnce([{ max_position: MAX_EXERCISES_PER_SESSION - 1 }])
      .mockReturnValueOnce([{ id: 'wse-new' }])
      .mockReturnValueOnce([{ id: 'set-new' }]);

    const result = appendWorkoutSessionExercise({
      workoutSessionId: 'ws-1',
      exerciseId: 'ex-50',
      exerciseName: 'Lateral Raise',
    });

    expect(result.focusExerciseId).toBe('wse-new');
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-new', 'ws-1', 'ex-50', 'Lateral Raise', 'strength', null, 50],
    );
  });

  it('rejects the 51st active exercise without inserting exercise, default set, or outbox ops', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: MAX_EXERCISES_PER_SESSION }]);

    let thrown: unknown;
    try {
      appendWorkoutSessionExercise({
        workoutSessionId: 'ws-1',
        exerciseId: 'ex-51',
        exerciseName: 'Cable Fly',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkoutLimitError);
    expect((thrown as Error).message).toBe(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    expect(exec).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      expect.any(Array),
    );
    expect(exec).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_set'),
      expect.any(Array),
    );
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
    expect(newId).not.toHaveBeenCalled();
  });

  it('does not count tombstoned workout exercises when appending after a delete', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: MAX_EXERCISES_PER_SESSION - 1 }])
      .mockReturnValueOnce([{ exercise_type: 'cardio', cardio_profile: 'bike' }])
      .mockReturnValueOnce([{ max_position: MAX_EXERCISES_PER_SESSION }])
      .mockReturnValueOnce([{ id: 'wse-new' }]);
    (newId as jest.Mock).mockReset().mockReturnValueOnce('wse-new');

    appendWorkoutSessionExercise({
      workoutSessionId: 'ws-1',
      exerciseId: 'ex-bike',
      exerciseName: 'Bike',
    });

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_session_exercise'),
      ['wse-new', 'ws-1', 'ex-bike', 'Bike', 'cardio', 'bike', 51],
    );
  });
});
