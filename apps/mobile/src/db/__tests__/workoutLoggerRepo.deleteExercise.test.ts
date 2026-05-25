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

import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import { deleteWorkoutSessionExercise } from '../workoutLoggerRepo';

describe('deleteWorkoutSessionExercise', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
  });

  it('tombstones exercise and child sets, compacts siblings, and enqueues snapshots', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
        expect(params).toEqual(['session-1']);
        return [{ id: 'session-1' }];
      }
      if (
        sql.includes('SELECT id, position') &&
        sql.includes('id = ?') &&
        sql.includes('workout_session_id = ?') &&
        params?.[0] === 'wse-delete'
      ) {
        expect(params).toEqual(['wse-delete', 'session-1']);
        return [{ id: 'wse-delete', position: 2 }];
      }
      if (sql.includes('FROM workout_set') && sql.includes('workout_session_exercise_id = ?')) {
        expect(params).toEqual(['wse-delete']);
        return [{ id: 'set-1' }, { id: 'set-2' }];
      }
      if (sql.includes('id <> ?')) {
        expect(params).toEqual(['session-1', 'wse-delete']);
        return [
          { id: 'wse-a', position: 1 },
          { id: 'wse-b', position: 3 },
        ];
      }
      if (sql.includes('FROM workout_session_exercise') && sql.includes('deleted_at IS NOT NULL')) {
        return [{ id: 'wse-old-deleted' }];
      }
      if (sql.includes('COALESCE(MIN(position), 0) AS min_pos')) {
        return [{ min_pos: -20 }];
      }
      if (
        sql.includes('FROM workout_session_exercise') &&
        sql.includes('deleted_at IS NULL') &&
        sql.includes('ORDER BY position ASC')
      ) {
        return [
          { id: 'wse-a', position: 1 },
          { id: 'wse-b', position: 3 },
        ];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_set')) {
        return [{ id: params?.[0], deleted_at: '2026-05-25 00:00:00' }];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
        return [{ id: params?.[0], workout_session_id: 'session-1' }];
      }
      return [];
    });

    const result = deleteWorkoutSessionExercise('session-1', 'wse-delete');

    expect(result).toEqual({ deleted: true });
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE workout_set'), [
      'wse-delete',
    ]);
    expect(exec).toHaveBeenCalledWith(
      'UPDATE workout_session_exercise SET position = ? WHERE id = ?',
      [-1021, 'wse-old-deleted'],
    );
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('SET position = ?, deleted_at = datetime'),
      [-21, 'wse-delete'],
    );
    expect(exec).toHaveBeenCalledWith(
      'UPDATE workout_session_exercise SET position = ? WHERE id = ?',
      [-1, 'wse-a'],
    );
    expect(exec).toHaveBeenCalledWith(
      'UPDATE workout_session_exercise SET position = ? WHERE id = ?',
      [-2, 'wse-b'],
    );
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET position = ?'), [1, 'wse-a']);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SET position = ?'), [2, 'wse-b']);
    expect(
      (exec as jest.Mock).mock.calls.some((call) =>
        String(call[0]).trim().startsWith('UPDATE workout_session\n'),
      ),
    ).toBe(false);

    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'workout_set', entityId: 'set-1', opType: 'delete' }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'workout_set', entityId: 'set-2', opType: 'delete' }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-delete',
        opType: 'delete',
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-b',
        opType: 'upsert',
      }),
    );
    expect(enqueueOutboxOp).not.toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'workout_session_exercise',
        entityId: 'wse-a',
        opType: 'upsert',
      }),
    );
  });

  it('treats a missing or already deleted target as a safe no-op', () => {
    (query as jest.Mock).mockReturnValueOnce([{ id: 'session-1' }]).mockReturnValueOnce([]);

    const result = deleteWorkoutSessionExercise('session-1', 'wse-missing');

    expect(result).toEqual({ deleted: false });
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });

  it('can delete the only exercise while leaving the session in progress', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM workout_session') && sql.includes("status = 'in_progress'")) {
        return [{ id: 'session-1' }];
      }
      if (
        sql.includes('SELECT id, position') &&
        sql.includes('id = ?') &&
        sql.includes('workout_session_id = ?') &&
        params?.[0] === 'wse-only'
      ) {
        return [{ id: 'wse-only', position: 1 }];
      }
      if (sql.includes('FROM workout_set') && sql.includes('workout_session_exercise_id = ?')) {
        return [];
      }
      if (sql.includes('id <> ?')) {
        return [];
      }
      if (sql.includes('FROM workout_session_exercise') && sql.includes('deleted_at IS NOT NULL')) {
        return [];
      }
      if (sql.includes('COALESCE(MIN(position), 0) AS min_pos')) {
        return [{ min_pos: 1 }];
      }
      if (
        sql.includes('FROM workout_session_exercise') &&
        sql.includes('deleted_at IS NULL') &&
        sql.includes('ORDER BY position ASC')
      ) {
        return [];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM workout_session_exercise')) {
        return [{ id: params?.[0], workout_session_id: 'session-1', deleted_at: 'now' }];
      }
      return [];
    });

    const result = deleteWorkoutSessionExercise('session-1', 'wse-only');

    expect(result).toEqual({ deleted: true });
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('SET position = ?, deleted_at = datetime'),
      [0, 'wse-only'],
    );
    expect(
      (exec as jest.Mock).mock.calls.some((call) =>
        String(call[0]).trim().startsWith('UPDATE workout_session\n'),
      ),
    ).toBe(false);
  });
});
