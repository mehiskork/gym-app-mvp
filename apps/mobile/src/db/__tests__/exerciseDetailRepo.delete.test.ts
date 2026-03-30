jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../appMetaRepo', () => ({
  getOrCreateLocalUserId: jest.fn(() => 'user-1'),
}));

import { exec, query } from '../db';
import { deleteCustomExerciseIfUnused, getExerciseDeletionState } from '../exerciseDetailRepo';

describe('exerciseDetailRepo deletion guards', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
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

  it('deletes unused custom exercises', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM exercise')) {
        return [{ id: 'ex-3', name: 'DB Press', is_custom: 1, owner_user_id: 'user-1' }];
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
