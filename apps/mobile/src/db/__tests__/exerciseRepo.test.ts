jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../appMetaRepo', () => ({
  getClaimedUserId: jest.fn(() => null),
  getOrCreateLocalUserId: jest.fn(() => 'local-user-1'),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(() => 'ex_custom-1'),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));

import { exec, query } from '../db';
import { enqueueOutboxOp } from '../outboxRepo';
import { getClaimedUserId, getOrCreateLocalUserId } from '../appMetaRepo';
import { inTransaction } from '../tx';
import {
  createCustomExercise,
  getCurrentExerciseOwnerUserId,
  listExercisesForCurrentUser,
} from '../exerciseRepo';

describe('exerciseRepo createCustomExercise', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
    (inTransaction as jest.Mock).mockClear();
    (getClaimedUserId as jest.Mock).mockReturnValue(null);
    (getOrCreateLocalUserId as jest.Mock).mockReturnValue('local-user-1');
  });

  it('enqueues an exercise upsert snapshot after local insert', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (
        sql.includes('SELECT *') &&
        sql.includes('FROM exercise') &&
        params?.[0] === 'ex_custom-1'
      ) {
        return [{ id: 'ex_custom-1', name: 'Squat', is_custom: 1 }];
      }
      return [];
    });

    const id = createCustomExercise('Squat');

    expect(id).toBe('ex_custom-1');
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exercise'),
      expect.any(Array),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise',
        entityId: 'ex_custom-1',
        opType: 'upsert',
      }),
    );
    expect(inTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses the device-local exercise owner in true guest mode', () => {
    expect(getCurrentExerciseOwnerUserId()).toBe('local-user-1');

    listExercisesForCurrentUser();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM exercise'), ['local-user-1']);
  });

  it('uses claimed account owner for linked account custom exercise visibility', () => {
    (getClaimedUserId as jest.Mock).mockReturnValue(
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    );

    expect(getCurrentExerciseOwnerUserId()).toBe(
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    );

    listExercisesForCurrentUser();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM exercise'), [
      'https://securetoken.google.com/gym-app-mvp-1d7f0|firebase-uid',
    ]);
  });
});
