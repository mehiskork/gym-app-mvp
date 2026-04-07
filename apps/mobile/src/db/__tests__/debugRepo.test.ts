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
  getSupportBundle,
  getWorkoutSessionExerciseSchemaHealth,
  getSyncDebugInfo,
} from '../debugRepo';
import * as debugRepo from '../debugRepo';

describe('debugRepo diagnostics and repair helpers', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
  });

  it('repairs missing sets only for strength workout_session_exercise rows', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'wse-strength-1' }]);

    const repaired = debugRepo.repairSessionsMissingSets();

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

    const health = debugRepo.verifySyncState();

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
  it('surfaces derived auth debug state in sync debug info', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM outbox_op') && sql.includes('COUNT(*) AS c') && sql.includes('status IN')) return [{ c: 2 }];
      if (sql.includes('SELECT status, COUNT(*) AS c') && sql.includes('FROM outbox_op')) return [{ status: 'pending', c: 2 }];
      if (sql.includes('FROM outbox_op') && sql.includes("status IN ('pending', 'failed')")) return [{ c: 1 }];
      if (sql.includes('FROM outbox_op') && sql.includes('LIMIT 10')) return [];
      if (sql.includes('FROM app_meta') && params?.[0] === 'auth_debug_state_v1') {
        return [
          {
            value: JSON.stringify({
              syncAuthModeLastUsed: 'account_jwt',
              syncAuthModeNextPlanned: 'device_token',
              accountSessionStatus: 'invalidated',
              accountInvalidationReason: 'sync_401',
              accountInvalidatedAt: '2026-04-07T00:00:00.000Z',
              deviceTokenPresent: true,
              linkedState: 'linked',
            }),
          },
        ];
      }
      if (sql.includes('FROM app_meta') && params?.[0] === 'claimed_user_id') return [{ value: 'user-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'device_id') return [{ value: 'dev-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'guest_user_id') return [{ value: 'guest-1' }];
      if (sql.includes('FROM sync_state')) return [{ cursor: '0' }];
      return [];
    });

    const info = getSyncDebugInfo();

    expect(info.authDebug.syncAuthModeLastUsed).toBe('account_jwt');
    expect(info.authDebug.syncAuthModeNextPlanned).toBe('device_token');
    expect(info.authDebug.accountSessionStatus).toBe('invalidated');
    expect(info.authDebug.accountInvalidationReason).toBe('sync_401');
    expect(info.authDebug.accountInvalidatedAt).toBe('2026-04-07T00:00:00.000Z');
    expect(info.authDebug.deviceTokenPresent).toBe(true);
    expect(info.authDebug.linkedState).toBe('linked');
  });

  it('includes auth snapshot in support bundle without secrets', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM app_meta') && params?.[0] === 'device_id') return [{ value: 'dev-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'guest_user_id') return [{ value: 'guest-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'local_user_id') return [{ value: 'local-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'auth_debug_state_v1') {
        return [
          {
            value: JSON.stringify({
              syncAuthModeLastUsed: 'device_token',
              syncAuthModeNextPlanned: 'account_jwt',
              accountSessionStatus: 'usable',
              accountInvalidationReason: null,
              accountInvalidatedAt: null,
              deviceTokenPresent: false,
              linkedState: 'guest',
            }),
          },
        ];
      }
      if (sql.includes('FROM app_meta') && params?.[0] === 'claimed_user_id') return [];
      if (sql.includes('SELECT COUNT(*) AS c FROM outbox_op')) return [{ c: 0 }];
      if (sql.includes('SELECT status, COUNT(*) AS c') && sql.includes('FROM outbox_op')) return [];
      if (sql.includes('FROM outbox_op') && sql.includes('next_attempt_at')) return [{ c: 0 }];
      if (sql.includes('FROM outbox_op') && sql.includes('LIMIT 50')) return [];
      if (sql.includes('FROM sync_state')) return [{ cursor: '42' }];
      if (sql.includes('FROM sync_run')) return [];
      if (sql.includes('COUNT(*) AS c FROM')) return [{ c: 0 }];
      return [];
    });

    const bundle = getSupportBundle();

    expect(bundle.auth.accountSessionStatus).toBe('usable');
    expect(bundle.auth.syncAuthModeLastUsed).toBe('device_token');
    expect(bundle.auth.syncAuthModeNextPlanned).toBe('account_jwt');
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('"accessToken"');
    expect(json).not.toContain('"refreshToken"');
    expect(json).not.toContain('"deviceToken"');
  });
});
