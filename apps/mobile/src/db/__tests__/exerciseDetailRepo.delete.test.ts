jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../appMetaRepo', () => ({
  getClaimedUserId: jest.fn(() => null),
  getOrCreateLocalUserId: jest.fn(() => 'user-1'),
}));

jest.mock('../tx', () => ({
  inTransaction: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));

import { exec, query } from '../db';
import { getClaimedUserId } from '../appMetaRepo';
import { enqueueOutboxOp } from '../outboxRepo';
import { inTransaction } from '../tx';
import {
  deleteCustomExerciseIfUnused,
  getExerciseById,
  getExerciseDeletionState,
} from '../exerciseDetailRepo';

describe('exerciseDetailRepo deletion guards', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (inTransaction as jest.Mock).mockClear();
    (getClaimedUserId as jest.Mock).mockReturnValue(null);
  });

  it('blocks deletion for curated exercises', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [{ id: 'ex-1', name: 'Bench Press', is_custom: 0, owner_user_id: null }];
      }
      return [{ n: 0 }];
    });

    const state = getExerciseDeletionState('ex-1');

    expect(state.canRequestDelete).toBe(false);
    expect(state.canDelete).toBe(false);
    expect(state.blockReason).toContain('custom exercises');
  });

  it('still resolves deprecated seeded exercise IDs by id', () => {
    (query as jest.Mock).mockImplementation((_sql: string, params?: unknown[]) => {
      if (params?.[0] === 'ex_chest_press_machine') {
        return [
          {
            id: 'ex_chest_press_machine',
            name: 'Chest Press Machine',
            is_custom: 0,
            owner_user_id: null,
          },
        ];
      }
      if (params?.[0] === 'ex_shoulder_press_machine') {
        return [
          {
            id: 'ex_shoulder_press_machine',
            name: 'Shoulder Press Machine',
            is_custom: 0,
            owner_user_id: null,
          },
        ];
      }
      return [];
    });

    expect(getExerciseById('ex_chest_press_machine')?.name).toBe('Chest Press Machine');
    expect(getExerciseById('ex_shoulder_press_machine')?.name).toBe('Shoulder Press Machine');
  });

  it('blocks deletion for used custom exercises', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [{ id: 'ex-2', name: 'Cable Row', is_custom: 1, owner_user_id: 'user-1' }];
      }
      if (sql.includes('FROM program_day_exercise')) return [{ n: 1 }];
      if (sql.includes('FROM workout_session_exercise')) return [{ n: 0 }];
      return [];
    });

    const state = getExerciseDeletionState('ex-2');

    expect(state.canRequestDelete).toBe(true);
    expect(state.canDelete).toBe(false);
    expect(state.blockReason).toContain('cannot be deleted');
  });

  it('soft deletes unused custom exercises and enqueues a tombstone in one transaction', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [
          {
            id: 'ex-3',
            name: 'DB Press',
            is_custom: 1,
            owner_user_id: 'user-1',
            deleted_at: '2026-04-29T00:00:00.000Z',
          },
        ];
      }
      if (sql.includes('FROM program_day_exercise')) return [{ n: 0 }];
      if (sql.includes('FROM workout_session_exercise')) return [{ n: 0 }];
      return [];
    });

    deleteCustomExerciseIfUnused('ex-3');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE exercise'), [
      'ex-3',
      'user-1',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise',
        entityId: 'ex-3',
        opType: 'delete',
      }),
    );
    expect(inTransaction).toHaveBeenCalledTimes(1);
  });

  it('allows linked account owners to delete restored custom exercises', () => {
    (getClaimedUserId as jest.Mock).mockReturnValue('account-owner-1');
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [
          {
            id: 'ex-5',
            name: 'Restored Cable Row',
            is_custom: 1,
            owner_user_id: 'account-owner-1',
            deleted_at: '2026-04-29T00:00:00.000Z',
          },
        ];
      }
      if (sql.includes('FROM program_day_exercise')) return [{ n: 0 }];
      if (sql.includes('FROM workout_session_exercise')) return [{ n: 0 }];
      return [];
    });

    const state = getExerciseDeletionState('ex-5');
    expect(state.canDelete).toBe(true);

    deleteCustomExerciseIfUnused('ex-5');

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE exercise'), [
      'ex-5',
      'account-owner-1',
    ]);
  });

  it('throws when trying to delete used custom exercises', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [{ id: 'ex-4', name: 'Lat Raise', is_custom: 1, owner_user_id: 'user-1' }];
      }
      if (sql.includes('FROM program_day_exercise')) return [{ n: 0 }];
      if (sql.includes('FROM workout_session_exercise')) return [{ n: 2 }];
      return [];
    });

    expect(() => deleteCustomExerciseIfUnused('ex-4')).toThrow('cannot be deleted');
    expect(exec).not.toHaveBeenCalled();
  });
});
