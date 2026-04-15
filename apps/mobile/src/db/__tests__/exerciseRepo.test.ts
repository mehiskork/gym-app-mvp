jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../appMetaRepo', () => ({
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
import { createCustomExercise } from '../exerciseRepo';

describe('exerciseRepo createCustomExercise', () => {
  beforeEach(() => {
    (exec as jest.Mock).mockReset();
    (query as jest.Mock).mockReset();
    (enqueueOutboxOp as jest.Mock).mockReset();
  });

  it('enqueues an exercise upsert snapshot after local insert', () => {
    (query as jest.Mock).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT *') && sql.includes('FROM exercise') && params?.[0] === 'ex_custom-1') {
        return [{ id: 'ex_custom-1', name: 'Squat', is_custom: 1 }];
      }
      return [];
    });

    const id = createCustomExercise('Squat');

    expect(id).toBe('ex_custom-1');
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO exercise'), expect.any(Array));
    expect(enqueueOutboxOp).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'exercise',
        entityId: 'ex_custom-1',
        opType: 'upsert',
      }),
    );
  });
});