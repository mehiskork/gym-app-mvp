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
  rewriteCustomExerciseOwnerAfterAccountClaim,
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

  it('rewrites guest custom exercise owners and enqueues corrected active and deleted snapshots', async () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id, deleted_at') && sql.includes('FROM exercise')) {
        expect(params).toEqual(['local-user-1']);
        return [
          { id: 'ex_custom-active', deleted_at: null },
          { id: 'ex_custom-deleted', deleted_at: '2026-05-25 10:00:00' },
        ];
      }
      if (sql.includes('SELECT *') && sql.includes('FROM exercise')) {
        return [
          {
            id: params?.[0],
            is_custom: 1,
            owner_user_id: 'account-owner-1',
            deleted_at: params?.[0] === 'ex_custom-deleted' ? '2026-05-25 10:00:00' : null,
          },
        ];
      }
      return [];
    });

    await expect(
      rewriteCustomExerciseOwnerAfterAccountClaim('local-user-1', 'account-owner-1'),
    ).resolves.toBe(2);

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('UPDATE exercise'), [
      'account-owner-1',
      'local-user-1',
      'ex_custom-active',
      'ex_custom-deleted',
    ]);
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise',
        entityId: 'ex_custom-active',
        opType: 'upsert',
        payloadJson: expect.stringContaining('"owner_user_id":"account-owner-1"'),
      }),
    );
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise',
        entityId: 'ex_custom-deleted',
        opType: 'delete',
        payloadJson: expect.stringContaining('"deleted_at":"2026-05-25 10:00:00"'),
      }),
    );
    expect(inTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite built-in, already-account-owned, or repeatedly rewritten exercises', async () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id, deleted_at') && params?.[0] === 'local-user-1') {
        return [];
      }
      return [];
    });

    await expect(
      rewriteCustomExerciseOwnerAfterAccountClaim('local-user-1', 'account-owner-1'),
    ).resolves.toBe(0);

    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
  });

  it('no-ops when owner arguments are blank or already matching', async () => {
    await expect(rewriteCustomExerciseOwnerAfterAccountClaim('', 'account-owner-1')).resolves.toBe(
      0,
    );
    await expect(rewriteCustomExerciseOwnerAfterAccountClaim('local-user-1', '   ')).resolves.toBe(
      0,
    );
    await expect(
      rewriteCustomExerciseOwnerAfterAccountClaim('account-owner-1', 'account-owner-1'),
    ).resolves.toBe(0);

    expect(query).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(enqueueOutboxOp).not.toHaveBeenCalled();
    expect(inTransaction).not.toHaveBeenCalled();
  });
});
