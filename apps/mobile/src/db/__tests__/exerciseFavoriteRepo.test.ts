jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../appMetaRepo', () => ({
  getOrCreateDeviceId: jest.fn(() => 'dev-1'),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));

import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import { inTransaction } from '../tx';
import {
  exerciseFavoriteId,
  setExerciseFavorite,
  toggleExerciseFavorite,
} from '../exerciseFavoriteRepo';

describe('exerciseFavoriteRepo', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (inTransaction as jest.Mock).mockClear();
  });

  it('uses deterministic favorite IDs', () => {
    expect(exerciseFavoriteId('ex_bench_press_barbell')).toBe('exfav_ex_bench_press_barbell');
    expect(exerciseFavoriteId('ex custom/1')).toBe('exfav_ex%20custom%2F1');
  });

  it('favorites an exercise with an upsert snapshot', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('WHERE exercise_id = ?')) return [];
      if (sql.includes('WHERE id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: null,
            version: 1,
          },
        ];
      }
      return [];
    });

    expect(setExerciseFavorite('ex_bench_press_barbell', true)).toBe(true);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO exercise_favorite'), [
      'exfav_ex_bench_press_barbell',
      'ex_bench_press_barbell',
      'dev-1',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise_favorite',
        entityId: 'exfav_ex_bench_press_barbell',
        opType: 'upsert',
        payloadJson: expect.stringContaining('"exercise_id":"ex_bench_press_barbell"'),
      }),
    );
    expect(inTransaction).toHaveBeenCalledTimes(1);
  });

  it('unfavorites with a tombstone delete snapshot', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('WHERE exercise_id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: null,
            version: 1,
          },
        ];
      }
      if (sql.includes('WHERE id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: '2026-06-10 10:00:00',
            version: 2,
          },
        ];
      }
      return [];
    });

    expect(setExerciseFavorite('ex_bench_press_barbell', false)).toBe(false);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE exercise_favorite'), [
      'dev-1',
      'ex_bench_press_barbell',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise_favorite',
        entityId: 'exfav_ex_bench_press_barbell',
        opType: 'delete',
        payloadJson: expect.stringContaining('"deleted_at":"2026-06-10 10:00:00"'),
      }),
    );
  });

  it('re-favorites by clearing deleted_at through the deterministic row', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('WHERE exercise_id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: '2026-06-10 10:00:00',
            version: 2,
          },
        ];
      }
      if (sql.includes('WHERE id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: null,
            version: 3,
          },
        ];
      }
      return [];
    });

    expect(setExerciseFavorite('ex_bench_press_barbell', true)).toBe(true);

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(exercise_id) DO UPDATE SET'),
      ['exfav_ex_bench_press_barbell', 'ex_bench_press_barbell', 'dev-1'],
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        opType: 'upsert',
        payloadJson: expect.stringContaining('"deleted_at":null'),
      }),
    );
  });

  it('toggles from active state to inactive', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('AND deleted_at IS NULL')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: null,
            version: 1,
          },
        ];
      }
      if (sql.includes('WHERE exercise_id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: null,
            version: 1,
          },
        ];
      }
      if (sql.includes('WHERE id = ?')) {
        return [
          {
            id: 'exfav_ex_bench_press_barbell',
            exercise_id: 'ex_bench_press_barbell',
            deleted_at: '2026-06-10 10:00:00',
            version: 2,
          },
        ];
      }
      return [];
    });

    expect(toggleExerciseFavorite('ex_bench_press_barbell')).toBe(false);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(expect.objectContaining({ opType: 'delete' }));
  });
});
