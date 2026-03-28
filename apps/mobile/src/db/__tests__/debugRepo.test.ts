jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(() => 'set-new'),
}));

jest.mock('expo-application', () => ({
  applicationId: 'test.app',
  applicationName: 'Test',
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));

import { exec, query } from '../db';
import {
  getWorkoutSessionExerciseSchemaHealth,
  repairSessionsMissingSets,
  verifySyncState,
} from '../debugRepo';

describe('debugRepo diagnostics and repair helpers', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
  });

  it('repairs missing sets only for strength workout_session_exercise rows', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'wse-strength-1' }]);

    const repaired = repairSessionsMissingSets();

    expect(repaired).toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("wse.exercise_type = 'strength'"));
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workout_set'), [
      'set-new',
      'wse-strength-1',
      expect.any(Number),
    ]);
  });

  it('accepts fresh sync_state row when cursor is null and schema is valid', () => {
    (query as jest.Mock)
      .mockReturnValueOnce([
        { name: 'id' },
        { name: 'cursor' },
        { name: 'last_sync_at' },
        { name: 'last_error' },
        { name: 'backoff_until' },
        { name: 'consecutive_failures' },
        { name: 'last_delta_count' },
      ])
      .mockReturnValueOnce([{ cursor: null }]);

    const health = verifySyncState();

    expect(health.ok).toBe(true);
    expect(health.missingColumns).toEqual([]);
  });

  it('flags workout_session_exercise schema drift and legacy cardio_duration_seconds', () => {
    (query as jest.Mock).mockReturnValueOnce([
      { name: 'id' },
      { name: 'exercise_type' },
      { name: 'cardio_profile' },
      { name: 'cardio_duration_seconds' },
      { name: 'notes' },
    ]);

    const health = getWorkoutSessionExerciseSchemaHealth();

    expect(health.ok).toBe(false);
    expect(health.hasLegacyCardioDurationSeconds).toBe(true);
    expect(health.missingColumns).toEqual(
      expect.arrayContaining([
        'cardio_duration_minutes',
        'cardio_distance_km',
        'cardio_speed_kph',
        'cardio_incline_percent',
        'cardio_resistance_level',
        'cardio_pace_seconds_per_km',
        'cardio_floors',
        'cardio_stair_level',
      ]),
    );
  });
});