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

import {
  enqueueOutboxOp,
  hasActiveOutboxOpForEntity,
  listPendingOutboxOps,
  markOutboxOpRejected,
} from '../outboxRepo';
import { exec, query } from '../db';
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

  it('keeps rejected ops below max attempts retryable with backoff metadata', () => {
    (query as jest.Mock).mockReturnValueOnce([{ status: 'in_flight', attempt_count: 8 }]);
    const computeNextAttemptAt = jest.fn(() => '2026-05-13T12:05:00.000Z');

    markOutboxOpRejected('op-1', 'sync op rejected: bad payload', computeNextAttemptAt);

    expect(computeNextAttemptAt).toHaveBeenCalledWith(9);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("status = 'failed'"), [
      9,
      'sync op rejected: bad payload',
      '2026-05-13T12:05:00.000Z',
      'op-1',
    ]);
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('last_attempt_at = datetime');
  });

  it('marks rejected ops dead when the next attempt reaches the inclusive threshold', () => {
    (query as jest.Mock).mockReturnValueOnce([{ status: 'in_flight', attempt_count: 9 }]);
    const computeNextAttemptAt = jest.fn(() => '2026-05-13T12:05:00.000Z');

    markOutboxOpRejected('op-1', 'sync op rejected: immutable field', computeNextAttemptAt);

    expect(computeNextAttemptAt).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("status = 'dead'"), [
      10,
      'sync op rejected: immutable field',
      'op-1',
    ]);
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('next_attempt_at = NULL');
    expect((exec as jest.Mock).mock.calls[0][0]).toContain('last_attempt_at = datetime');
  });

  it('does not mutate an already dead rejected op', () => {
    (query as jest.Mock).mockReturnValueOnce([{ status: 'dead', attempt_count: 10 }]);

    markOutboxOpRejected('op-1', 'sync op rejected: still bad', jest.fn());

    expect(exec).not.toHaveBeenCalled();
  });

  it('does not mutate when rejected op row no longer exists', () => {
    (query as jest.Mock).mockReturnValueOnce([]);

    markOutboxOpRejected('op-1', 'sync op rejected: missing row', jest.fn());

    expect(exec).not.toHaveBeenCalled();
  });

  it('selects only pending and failed ops for automatic retry', () => {
    (query as jest.Mock).mockReturnValueOnce([]);

    listPendingOutboxOps(50);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status IN ('pending', 'failed')"),
      [50],
    );
    expect((query as jest.Mock).mock.calls[0][0]).not.toContain("'dead'");
  });

  it('detects active outbox work for an entity', () => {
    (query as jest.Mock).mockReturnValueOnce([{ n: 1 }]);

    expect(hasActiveOutboxOpForEntity('workout_set', 'set-1')).toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'failed', 'in_flight')"),
      ['workout_set', 'set-1'],
    );
  });

  it('does not count inactive outbox work as active entity work', () => {
    (query as jest.Mock).mockReturnValueOnce([{ n: 0 }]);

    expect(hasActiveOutboxOpForEntity('workout_set', 'set-1')).toBe(false);
  });
});
