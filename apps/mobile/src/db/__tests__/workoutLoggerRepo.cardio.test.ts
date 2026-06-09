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
import { enqueueOutboxOp } from '../outboxRepo';
import { newId } from '../../utils/ids';
import {
  appendWorkoutSessionExercise,
  updateWorkoutSessionExerciseCardioSummary,
} from '../workoutLoggerRepo';

describe('workoutLoggerRepo cardio', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (newId as jest.Mock).mockReset().mockReturnValue('wse-new');
  });

  it('appends cardio exercise without inserting strength set rows', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ id: 'ws-1' }])
      .mockReturnValueOnce([{ n: 2 }])
      .mockReturnValueOnce([{ exercise_type: 'cardio', cardio_profile: 'treadmill' }])
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

  it('persists valid cardio boundary values and enqueues a snapshot', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress', exercise_type: 'cardio' }])
      .mockReturnValueOnce([
        {
          id: 'wse-1',
          cardio_duration_minutes: 999,
          cardio_distance_km: 999.9,
          cardio_speed_kph: 99.9,
          cardio_incline_percent: 50,
          cardio_resistance_level: 999,
          cardio_floors: 999,
          cardio_stair_level: 999,
        },
      ]);

    updateWorkoutSessionExerciseCardioSummary('wse-1', {
      duration_minutes: 999,
      distance_km: 999.9,
      speed_kph: 99.9,
      incline_percent: 50,
      resistance_level: 999,
      floors: 999,
      stair_level: 999,
    });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('cardio_duration_minutes = ?'), [
      999,
      999.9,
      99.9,
      50,
      999,
      999,
      999,
      'wse-1',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-1',
        opType: 'upsert',
        payloadJson: expect.stringContaining('"cardio_incline_percent":50'),
      }),
    );
  });

  it('persists valid pace seconds', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress', exercise_type: 'cardio' }])
      .mockReturnValueOnce([{ id: 'wse-1', cardio_pace_seconds_per_km: 365 }]);

    updateWorkoutSessionExerciseCardioSummary('wse-1', {
      pace_seconds_per_km: 365,
    });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('cardio_pace_seconds_per_km = ?'), [
      365,
      'wse-1',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalled();
  });

  it('returns before SQL or outbox when patch contains only invalid cardio values', () => {
    updateWorkoutSessionExerciseCardioSummary('wse-1', {
      duration_minutes: 1000,
      distance_km: 82.55,
      pace_seconds_per_km: 6000,
    });

    expect(query).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });

  it('persists only valid values when patch mixes valid and invalid cardio values', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([{ status: 'in_progress', exercise_type: 'cardio' }])
      .mockReturnValueOnce([{ id: 'wse-1', cardio_duration_minutes: 30 }]);

    updateWorkoutSessionExerciseCardioSummary('wse-1', {
      duration_minutes: 30,
      distance_km: 82.55,
      pace_seconds_per_km: 0,
    });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('cardio_duration_minutes = ?'), [
      30,
      'wse-1',
    ]);
    expect(String((exec as jest.Mock).mock.calls[0][0])).not.toContain('cardio_distance_km');
    expect(String((exec as jest.Mock).mock.calls[0][0])).not.toContain(
      'cardio_pace_seconds_per_km',
    );
    expect(enqueueOutboxOp).toHaveBeenCalled();
  });
});
