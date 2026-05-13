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
      if (
        sql.includes('FROM outbox_op') &&
        sql.includes('COUNT(*) AS c') &&
        sql.includes('status IN')
      )
        return [{ c: 2 }];
      if (sql.includes('SELECT status, COUNT(*) AS c') && sql.includes('FROM outbox_op'))
        return [{ status: 'pending', c: 2 }];
      if (sql.includes('FROM outbox_op') && sql.includes("status IN ('pending', 'failed')"))
        return [{ c: 1 }];
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
      if (sql.includes('FROM app_meta') && params?.[0] === 'claimed_user_id')
        return [{ value: 'user-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'device_id') return [{ value: 'dev-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'guest_user_id')
        return [{ value: 'guest-1' }];
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

  it('reports sync debug outbox counts without malformed SQL', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM\s+outbox_op\s*;\s*\)/i.test(sql)) {
        throw new Error(`Malformed SQL in test: ${sql}`);
      }
      if (sql.includes('SELECT COUNT(*) AS c') && sql.includes('FROM outbox_op;'))
        return [{ c: 5 }];
      if (sql.includes('SELECT status, COUNT(*) AS c') && sql.includes('FROM outbox_op')) {
        return [
          { status: 'pending', c: 1 },
          { status: 'failed', c: 1 },
          { status: 'in_flight', c: 1 },
          { status: 'acked', c: 1 },
          { status: 'dead', c: 1 },
        ];
      }
      if (sql.includes('FROM outbox_op') && sql.includes("status IN ('pending', 'failed')"))
        return [{ c: 2 }];
      if (sql.includes('FROM outbox_op') && sql.includes('LIMIT 10')) return [];
      if (sql.includes('FROM app_meta') && params?.[0] === 'device_id') return [{ value: 'dev-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'guest_user_id')
        return [{ value: 'guest-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'auth_debug_state_v1') return [];
      if (sql.includes('FROM app_meta') && params?.[0] === 'claimed_user_id') return [];
      if (sql.includes('FROM sync_state')) {
        return [
          {
            id: 1,
            cursor: '42',
            last_sync_at: null,
            last_error: null,
            backoff_until: null,
            consecutive_failures: 0,
            last_delta_count: 0,
          },
        ];
      }
      return [];
    });

    const info = getSyncDebugInfo();

    expect(info.outboxHistoryTotalCount).toBe(5);
    expect(info.outboxStatusCounts).toEqual({
      pending: 1,
      failed: 1,
      in_flight: 1,
      acked: 1,
      dead: 1,
    });
    expect(info.pendingOpsCount).toBe(3);
    expect(info.dueNowCount).toBe(2);
  });

  it('includes auth snapshot in support bundle without secrets', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM app_meta') && params?.[0] === 'device_id') return [{ value: 'dev-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'guest_user_id')
        return [{ value: 'guest-1' }];
      if (sql.includes('FROM app_meta') && params?.[0] === 'local_user_id')
        return [{ value: 'local-1' }];
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
      if (sql.includes('SELECT COUNT(*) AS c FROM outbox_op')) return [{ c: 1 }];
      if (sql.includes('SELECT status, COUNT(*) AS c') && sql.includes('FROM outbox_op')) {
        return [{ status: 'dead', c: 1 }];
      }
      if (sql.includes('FROM outbox_op') && sql.includes('next_attempt_at')) return [{ c: 0 }];
      if (sql.includes('FROM outbox_op') && sql.includes('LIMIT 50')) {
        return [
          {
            op_id: 'op-dead-1',
            entity_type: 'exercise',
            entity_id: 'exercise-1',
            op_type: 'upsert',
            status: 'dead',
            attempt_count: 10,
            last_error: 'sync op rejected: bad payload',
            created_at: '2026-05-13T12:00:00.000Z',
            updated_at: '2026-05-13T12:10:00.000Z',
          },
        ];
      }
      if (sql.includes('FROM sync_state')) return [{ cursor: '42' }];
      if (sql.includes('FROM sync_run')) return [];
      if (
        sql.includes('FROM app_meta') &&
        params?.[0] === 'latest_sync_apply_failure_diagnostic_v1'
      ) {
        return [
          {
            value: JSON.stringify({
              capturedAt: '2026-04-28T12:00:00.000Z',
              errorMessage: 'UNIQUE constraint failed',
              cursorBefore: '0',
              responseCursor: '590',
              deltaIndex: 0,
              changeId: 123,
              entityType: 'program_day_exercise',
              entityId: 'incoming-day-ex-1',
              opType: 'upsert',
              tableName: 'program_day_exercise',
              orderedParent: {
                parentField: 'program_day_id',
                parentId: 'day-1',
                orderField: 'position',
                orderValue: 1,
              },
              orderedPayload: {
                id: 'incoming-day-ex-1',
                program_day_id: 'day-1',
                position: 1,
              },
              localSiblings: [],
            }),
          },
        ];
      }
      if (sql.includes('COUNT(*) AS c FROM')) return [{ c: 0 }];
      return [];
    });

    const bundle = getSupportBundle();

    expect(bundle.latestSyncApplyFailure?.entityType).toBe('program_day_exercise');
    expect(bundle.latestSyncApplyFailure?.orderedParent).toEqual(
      expect.objectContaining({ parentField: 'program_day_id', parentId: 'day-1' }),
    );
    expect(bundle.auth.accountSessionStatus).toBe('usable');
    expect(bundle.auth.syncAuthModeLastUsed).toBe('device_token');
    expect(bundle.auth.syncAuthModeNextPlanned).toBe('account_jwt');
    expect(bundle.outbox.byStatus.dead).toBe(1);
    expect(bundle.outbox.recentOps[0]).toEqual({
      opId: 'op-dead-1',
      entityType: 'exercise',
      entityId: 'exercise-1',
      opType: 'upsert',
      status: 'dead',
      attemptCount: 10,
      lastError: 'sync op rejected: bad payload',
      createdAt: '2026-05-13T12:00:00.000Z',
      updatedAt: '2026-05-13T12:10:00.000Z',
    });
    const json = JSON.stringify(bundle);
    expect(json).not.toContain('payload_json');
    expect(json).not.toContain('"accessToken"');
    expect(json).not.toContain('"refreshToken"');
    expect(json).not.toContain('"deviceToken"');
    expect(json).not.toContain('firebase');
    expect(json).not.toContain('secret');
  });
});
