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

jest.mock('../../utils/logger', () => ({
  logEvent: jest.fn(),
}));

describe('applyDeltas null upsert + timestamp handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
