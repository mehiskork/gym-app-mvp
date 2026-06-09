import {
  applyDeltas,
  getSyncApplyFailureDiagnosticFromError,
  persistSyncApplyFailureDiagnostic,
  type SyncDelta,
} from '../applyDeltas';
import { exec, query } from '../../db/db';

jest.mock('../../db/db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../../db/outboxRepo', () => ({
  hasActiveOutboxOpForEntity: jest.fn(() => false),
}));

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

import { hasActiveOutboxOpForEntity } from '../../db/outboxRepo';

describe('applyDeltas null upsert + timestamp handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasActiveOutboxOpForEntity as jest.Mock).mockReturnValue(false);
  });

  it('removes COALESCE and allows null overwrite', () => {
    (query as jest.Mock).mockReturnValue([]);

    const delta: SyncDelta = {
      entityType: 'exercise',
      entityId: 'e1',
      opType: 'upsert',
      payload: {
        id: 'e1',
        notes: null,
        updated_at: '2026-02-13 12:00:00',
      },
    };

    applyDeltas([delta]);

    expect(exec).toHaveBeenCalledTimes(1);
    const [sql] = (exec as jest.Mock).mock.calls[0];
    expect(sql).toContain('notes = excluded.notes');
    expect(sql).not.toContain('COALESCE(');
  });

  it('writes inbound planned cardio target fields on program_day_exercise', () => {
    (query as jest.Mock).mockReturnValue([]);

    const delta: SyncDelta = {
      entityType: 'program_day_exercise',
      entityId: 'pde-cardio',
      opType: 'upsert',
      payload: {
        id: 'pde-cardio',
        program_day_id: 'day-1',
        exercise_id: 'ex_rowing_machine',
        position: 1,
        planned_cardio_duration_minutes: 11,
        planned_cardio_distance_km: 11,
        planned_cardio_speed_kph: null,
        planned_cardio_incline_percent: null,
        planned_cardio_resistance_level: null,
        planned_cardio_pace_seconds_per_km: null,
        planned_cardio_floors: null,
        planned_cardio_stair_level: null,
        updated_at: '2026-02-13 12:00:00',
      },
    };

    applyDeltas([delta]);

    expect(exec).toHaveBeenCalledTimes(1);
    const [sql, params] = (exec as jest.Mock).mock.calls[0];
    expect(sql).toContain('planned_cardio_duration_minutes');
    expect(sql).toContain('planned_cardio_distance_km');
    expect(sql).toContain('planned_cardio_pace_seconds_per_km');
    expect(params).toEqual(expect.arrayContaining([11, 11, null]));
  });

  it('SQLite timestamp compare works; stale delta is skipped', () => {
    (query as jest.Mock).mockReturnValue([
      { updated_at: '2026-02-13 12:00:00', version: undefined },
    ]);

    const delta: SyncDelta = {
      entityType: 'exercise',
      entityId: 'e1',
      opType: 'upsert',
      payload: {
        id: 'e1',
        notes: 'old note',
        updated_at: '2026-02-13 11:00:00',
      },
    };

    const result = applyDeltas([delta]);

    expect(exec).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('applies delete delta even when local row has newer updated_at', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01T12:00:00.000Z', version: 1 }]);

    const result = applyDeltas([
      {
        entityType: 'exercise',
        entityId: 'e-delete-newer-local',
        opType: 'delete',
        payload: {
          id: 'e-delete-newer-local',
          deleted_at: '2026-05-01T10:00:00.000Z',
          updated_at: '2026-05-01T10:00:00.000Z',
          version: 1,
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect(exec).toHaveBeenCalledTimes(1);
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('SET deleted_at = COALESCE');
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual([
      '2026-05-01T10:00:00.000Z',
      '2026-05-01T10:00:00.000Z',
      'e-delete-newer-local',
    ]);
  });

  it('applies delete delta even when local row has higher version', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01T09:00:00.000Z', version: 5 }]);

    const result = applyDeltas([
      {
        entityType: 'program',
        entityId: 'p-delete-higher-version',
        opType: 'delete',
        payload: {
          id: 'p-delete-higher-version',
          deleted_at: '2026-05-01T10:00:00.000Z',
          updated_at: '2026-05-01T10:00:00.000Z',
          version: 2,
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect(exec).toHaveBeenCalledTimes(1);
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('UPDATE program');
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('SET deleted_at = COALESCE');
  });

  it('treats any delta with deleted_at as a delete before LWW skip logic', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01T12:00:00.000Z', version: 5 }]);

    const result = applyDeltas([
      {
        entityType: 'program',
        entityId: 'p-upsert-tombstone',
        opType: 'upsert',
        payload: {
          id: 'p-upsert-tombstone',
          name: 'Deleted Program',
          deleted_at: '2026-05-01T10:00:00.000Z',
          updated_at: '2026-05-01T10:00:00.000Z',
          version: 2,
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('UPDATE program');
    expect((exec as jest.Mock).mock.calls[0][0]).not.toContain('INSERT INTO program');
  });

  it('applies missing-row delete as a safe idempotent no-op', () => {
    (query as jest.Mock).mockReturnValue([]);

    const result = applyDeltas([
      {
        entityType: 'exercise',
        entityId: 'missing-exercise',
        opType: 'delete',
        payload: {
          id: 'missing-exercise',
          deleted_at: '2026-05-01T10:00:00.000Z',
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect(exec).toHaveBeenCalledTimes(1);
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('WHERE id = ?');
    expect((exec as jest.Mock).mock.calls[0][1]).toEqual([
      '2026-05-01T10:00:00.000Z',
      '2026-05-01T10:00:00.000Z',
      'missing-exercise',
    ]);
  });

  it('applies duplicate delete deltas idempotently without inserting active rows', () => {
    const rows: Record<
      string,
      { id: string; updated_at: string; deleted_at: string | null; version: number }
    > = {
      'program-dup-delete': {
        id: 'program-dup-delete',
        updated_at: '2026-05-01T12:00:00.000Z',
        deleted_at: null,
        version: 3,
      },
    };
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT updated_at, version FROM program')) {
        const id = params?.[0] as string;
        const row = rows[id];
        return row ? [{ updated_at: row.updated_at, version: row.version }] : [];
      }
      return [];
    });
    (exec as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('UPDATE program')) {
        const [deletedAt, updatedAt, id] = params as [string, string, string];
        if (rows[id]) {
          rows[id].deleted_at = deletedAt;
          rows[id].updated_at = updatedAt;
        }
      }
    });

    const delta: SyncDelta = {
      entityType: 'program',
      entityId: 'program-dup-delete',
      opType: 'delete',
      payload: {
        id: 'program-dup-delete',
        deleted_at: '2026-05-01T10:00:00.000Z',
        updated_at: '2026-05-01T10:00:00.000Z',
        version: 2,
      },
    };

    const result = applyDeltas([delta, delta]);

    expect(result).toEqual({ applied: 2, skipped: 0, total: 2 });
    expect(rows['program-dup-delete'].deleted_at).toBe('2026-05-01T10:00:00.000Z');
    expect(Object.values(rows).filter((row) => row.deleted_at === null)).toHaveLength(0);
    expect((exec as jest.Mock).mock.calls.map(([sql]) => sql).join('\n')).not.toContain(
      'INSERT INTO program',
    );
  });

  it('still applies newer remote upsert', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01T10:00:00.000Z', version: 1 }]);

    const result = applyDeltas([
      {
        entityType: 'exercise',
        entityId: 'e-newer-remote',
        opType: 'upsert',
        payload: {
          id: 'e-newer-remote',
          name: 'Remote Name',
          updated_at: '2026-05-01T12:00:00.000Z',
          version: 2,
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('INSERT INTO exercise');
  });

  it('keeps local workout_set completion when incoming stale delta has the same timestamp', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
        payload: {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          weight: 100,
          reps: 5,
          is_completed: 0,
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('keeps local workout_session_exercise when incoming stale delta has the same timestamp', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_session_exercise',
        entityId: 'wse-1',
        opType: 'upsert',
        payload: {
          id: 'wse-1',
          workout_session_id: 'session-1',
          exercise_id: 'exercise-1',
          exercise_name: 'Bench Press',
          position: 1,
          notes: 'stale remote note',
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('keeps local workout_session when incoming stale delta has the same timestamp', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_session',
        entityId: 'session-1',
        opType: 'upsert',
        payload: {
          id: 'session-1',
          title: 'Push Day',
          status: 'completed',
          workout_note: 'stale remote note',
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('keeps local workout_set completion when local timestamp is newer', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:01' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
        payload: {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          is_completed: 0,
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('applies strictly newer workout_set upsert when there is no local write protection', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
        payload: {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          weight: 102.5,
          reps: 5,
          is_completed: 1,
          updated_at: '2026-05-01 12:00:01',
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('INSERT INTO workout_set');
  });

  it('applies strictly newer workout_session_exercise upsert when there is no local write protection', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'workout_session_exercise',
        entityId: 'wse-1',
        opType: 'upsert',
        payload: {
          id: 'wse-1',
          workout_session_id: 'session-1',
          exercise_id: 'exercise-1',
          position: 1,
          notes: 'newer remote note',
          updated_at: '2026-05-01 12:00:01',
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('INSERT INTO workout_session_exercise');
  });

  it('upserts workout_session_exercise plan_note_snapshot from sync payload', () => {
    (query as jest.Mock).mockReturnValue([]);

    applyDeltas([
      {
        entityType: 'workout_session_exercise',
        entityId: 'wse-plan-note',
        opType: 'upsert',
        payload: {
          id: 'wse-plan-note',
          workout_session_id: 'session-1',
          exercise_id: 'exercise-1',
          exercise_name: 'Pull-Up',
          position: 1,
          notes: null,
          plan_note_snapshot: '2 sets overhand grip, 2 sets underhand grip',
          updated_at: '2026-05-01 12:00:01',
        },
      },
    ]);

    const [sql, values] = (exec as jest.Mock).mock.calls[0];
    expect(sql).toContain('plan_note_snapshot');
    expect(values).toContain('2 sets overhand grip, 2 sets underhand grip');
  });

  it('skips workout_set delta when the entity was sent in the current sync request', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas(
      [
        {
          entityType: 'workout_set',
          entityId: 'set-1',
          opType: 'upsert',
          payload: {
            id: 'set-1',
            workout_session_exercise_id: 'wse-1',
            set_index: 1,
            is_completed: 0,
            updated_at: '2026-05-01 12:00:01',
          },
        },
      ],
      { protectedEntityKeys: new Set(['workout_set:set-1']) },
    );

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('skips workout_set delta when the entity has active local outbox work', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);
    (hasActiveOutboxOpForEntity as jest.Mock).mockReturnValue(true);

    const result = applyDeltas([
      {
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
        payload: {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          is_completed: 0,
          updated_at: '2026-05-01 12:00:01',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(hasActiveOutboxOpForEntity).toHaveBeenCalledWith('workout_set', 'set-1');
    expect(exec).not.toHaveBeenCalled();
  });

  it('skips protected workout_set tombstone when the entity was sent in the current sync request', () => {
    const result = applyDeltas(
      [
        {
          entityType: 'workout_set',
          entityId: 'set-1',
          opType: 'delete',
          payload: {
            id: 'set-1',
            workout_session_exercise_id: 'wse-1',
            deleted_at: '2026-05-01 12:00:00',
            updated_at: '2026-05-01 12:00:00',
          },
        },
      ],
      { protectedEntityKeys: new Set(['workout_set:set-1']) },
    );

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('applies active workout tombstone when there is no protected or active local write', () => {
    const result = applyDeltas([
      {
        entityType: 'workout_session_exercise',
        entityId: 'wse-1',
        opType: 'delete',
        payload: {
          id: 'wse-1',
          workout_session_id: 'session-1',
          deleted_at: '2026-05-01 12:00:00',
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('UPDATE workout_session_exercise');
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('SET deleted_at = COALESCE');
  });

  it('skips multiple stale workout_set deltas without clearing completed local sets', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT updated_at FROM workout_set')) {
        return [
          { updated_at: params?.[0] === 'set-1' ? '2026-05-01 12:00:00' : '2026-05-01 12:00:02' },
        ];
      }
      return [];
    });

    const result = applyDeltas([
      {
        entityType: 'workout_set',
        entityId: 'set-1',
        opType: 'upsert',
        payload: {
          id: 'set-1',
          workout_session_exercise_id: 'wse-1',
          set_index: 1,
          is_completed: 0,
          updated_at: '2026-05-01 12:00:00',
        },
      },
      {
        entityType: 'workout_set',
        entityId: 'set-2',
        opType: 'upsert',
        payload: {
          id: 'set-2',
          workout_session_exercise_id: 'wse-1',
          set_index: 2,
          is_completed: 0,
          updated_at: '2026-05-01 12:00:01',
        },
      },
    ]);

    expect(result).toEqual({ applied: 0, skipped: 2, total: 2 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('keeps equal-timestamp upsert behavior unchanged for non-workout_set entities', () => {
    (query as jest.Mock).mockReturnValue([{ updated_at: '2026-05-01 12:00:00' }]);

    const result = applyDeltas([
      {
        entityType: 'exercise',
        entityId: 'exercise-1',
        opType: 'upsert',
        payload: {
          id: 'exercise-1',
          name: 'Remote Equal Timestamp',
          updated_at: '2026-05-01 12:00:00',
        },
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: 0, total: 1 });
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('INSERT INTO exercise');
  });

  it('upserts workout_session workout_note from sync payload', () => {
    (query as jest.Mock).mockReturnValue([]);

    const delta: SyncDelta = {
      entityType: 'workout_session',
      entityId: 'ws-1',
      opType: 'upsert',
      payload: {
        id: 'ws-1',
        title: 'Push Day',
        status: 'completed',
        started_at: '2026-03-01T10:00:00Z',
        ended_at: '2026-03-01T11:00:00Z',
        workout_note: 'Synced note',
      },
    };

    applyDeltas([delta]);

    const [sql, values] = (exec as jest.Mock).mock.calls[0];
    expect(sql).toContain('workout_note');
    expect(values).toContain('Synced note');
  });

  it('skips inbound pr_event because PR events are local-derived cache', () => {
    const delta: SyncDelta = {
      entityType: 'pr_event',
      entityId: 'pr-1',
      opType: 'upsert',
      payload: {
        id: 'pr-1',
        session_id: 'session-1',
        exercise_id: 'exercise-1',
        pr_type: 'weight',
        context: '',
        value: 100,
      },
    };

    const result = applyDeltas([delta]);

    expect(result).toEqual({ applied: 0, skipped: 1, total: 1 });
    expect(exec).not.toHaveBeenCalled();
  });

  it('captures ordered sibling diagnostics when program_day_exercise upsert fails', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT updated_at, version FROM program_day_exercise')) return [];
      if (sql.includes('FROM program_day_exercise') && sql.includes('WHERE program_day_id = ?')) {
        return [
          {
            id: 'existing-day-ex-1',
            program_day_id: 'day-1',
            position: 1,
            deleted_at: null,
            updated_at: '2026-04-28T10:00:00.000Z',
          },
        ];
      }
      return [];
    });
    (exec as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO program_day_exercise')) {
        throw new Error(
          'UNIQUE constraint failed: program_day_exercise.program_day_id, program_day_exercise.position',
        );
      }
    });

    const delta: SyncDelta = {
      changeId: 123,
      entityType: 'program_day_exercise',
      entityId: 'incoming-day-ex-1',
      opType: 'upsert',
      payload: {
        id: 'incoming-day-ex-1',
        program_day_id: 'day-1',
        exercise_id: 'exercise-1',
        position: 1,
        Authorization: 'Bearer should-not-be-captured',
        refreshToken: 'should-not-be-captured',
      },
    };

    let caught: unknown;
    try {
      applyDeltas([delta], { cursorBefore: '0', responseCursor: '590' });
    } catch (err) {
      caught = err;
    }

    const diagnostic = getSyncApplyFailureDiagnosticFromError(caught);
    expect(diagnostic).toEqual(
      expect.objectContaining({
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
        localSiblings: [
          {
            id: 'existing-day-ex-1',
            program_day_id: 'day-1',
            position: 1,
            deleted_at: null,
            updated_at: '2026-04-28T10:00:00.000Z',
          },
        ],
      }),
    );
    expect(JSON.stringify(diagnostic)).not.toContain('Bearer should-not-be-captured');
    expect(JSON.stringify(diagnostic)).not.toContain('should-not-be-captured');
  });

  it('persists sync apply diagnostics in app_meta for support bundle export', () => {
    persistSyncApplyFailureDiagnostic({
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
    });

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_meta'), [
      'latest_sync_apply_failure_diagnostic_v1',
      expect.stringContaining('"entityType":"program_day_exercise"'),
    ]);
  });
});
