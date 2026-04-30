jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('../appMetaRepo', () => ({
  getEffectiveUserId: jest.fn(() => 'user-1'),
  getOrCreateDeviceId: jest.fn(() => 'device-1'),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn((prefix: string) => `${prefix}-1`),
}));

jest.mock('../../sync/syncScheduler', () => ({
  scheduleSyncSoon: jest.fn(),
}));

import { enqueueOutboxOp } from '../outboxRepo';
import { exec } from '../db';
import { scheduleSyncSoon } from '../../sync/syncScheduler';

describe('outboxRepo scheduled sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules sync after enqueueing a pending outbox op', () => {
    const id = enqueueOutboxOp({
      entityType: 'program',
      entityId: 'program-1',
      opType: 'upsert',
      payloadJson: '{"id":"program-1"}',
    });

    expect(id).toBe('outbox-1');
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outbox_op'), [
      'outbox-1',
      'op-1',
      'device-1',
      'user-1',
      'program',
      'program-1',
      'upsert',
      '{"id":"program-1"}',
    ]);
    expect(scheduleSyncSoon).toHaveBeenCalledWith('outbox_write');
  });
});
