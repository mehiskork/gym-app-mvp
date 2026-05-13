jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

  return {
    openDatabaseSync: jest.fn(() => {
      const database = new DatabaseSync(':memory:');

      return {
        execSync: (sql: string) => {
          database.exec(sql);
        },
        prepareSync: (sql: string) => {
          const statement = database.prepare(sql);

          return {
            executeSync: (params: unknown[] = []) => {
              const normalized = sql.trim().toUpperCase();
              const bindParams = (Array.isArray(params) ? params : [params]) as Parameters<
                typeof statement.all
              >;

              if (
                normalized.startsWith('SELECT') ||
                normalized.startsWith('PRAGMA') ||
                normalized.startsWith('WITH')
              ) {
                return statement.all(...bindParams);
              }

              statement.run(...(bindParams as Parameters<typeof statement.run>));
              return [];
            },
            finalizeSync: jest.fn(),
          };
        },
      };
    }),
  };
});

jest.mock('../../sync/syncScheduler', () => ({
  scheduleSyncSoon: jest.fn(),
}));

import { exec, query, resetLocalDatabase } from '../db';
import { migration001_private_beta_baseline } from '../migrations/001_private_beta_baseline';
import { listPendingOutboxOps, markOutboxOpRejected } from '../outboxRepo';
import { OUTBOX_STATUS, type OutboxStatus } from '../constants';

type OutboxRow = {
  status: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  updated_at: string;
};

function migrate() {
  exec(migration001_private_beta_baseline.up);
}

function insertOutboxRow({
  opId,
  status,
  attemptCount = 0,
  nextAttemptAt = null,
  createdAt = '2026-05-13T12:00:00.000Z',
  updatedAt = '2026-05-13T12:00:00.000Z',
}: {
  opId: string;
  status: OutboxStatus;
  attemptCount?: number;
  nextAttemptAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}) {
  exec(
    `
    INSERT INTO outbox_op (
      id,
      op_id,
      device_id,
      user_id,
      entity_type,
      entity_id,
      op_type,
      payload_json,
      status,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    ) VALUES (?, ?, 'device-1', 'user-1', 'exercise', ?, 'upsert', '{"id":"exercise-1"}', ?, ?, ?, ?, ?);
  `,
    [
      `row-${opId}`,
      opId,
      `entity-${opId}`,
      status,
      attemptCount,
      nextAttemptAt,
      createdAt,
      updatedAt,
    ],
  );
}

function readOutboxRow(opId: string): OutboxRow {
  const row = query<OutboxRow>(
    `
    SELECT status, attempt_count, last_error, next_attempt_at, updated_at
    FROM outbox_op
    WHERE op_id = ?;
  `,
    [opId],
  )[0];

  if (!row) throw new Error(`Missing outbox row ${opId}`);
  return row;
}

describe('outboxRepo rejected op handling with SQLite', () => {
  beforeEach(() => {
    resetLocalDatabase();
    migrate();
  });

  it.each([OUTBOX_STATUS.PENDING, OUTBOX_STATUS.IN_FLIGHT, OUTBOX_STATUS.FAILED] as const)(
    'keeps rejected %s op below max retryable with persisted backoff metadata',
    (status) => {
      insertOutboxRow({ opId: `op-${status}`, status, attemptCount: 3 });

      markOutboxOpRejected(
        `op-${status}`,
        'sync op rejected: bad payload',
        () => '2026-05-13T12:05:00.000Z',
      );

      expect(readOutboxRow(`op-${status}`)).toEqual(
        expect.objectContaining({
          status: OUTBOX_STATUS.FAILED,
          attempt_count: 4,
          last_error: 'sync op rejected: bad payload',
          next_attempt_at: '2026-05-13T12:05:00.000Z',
        }),
      );
    },
  );

  it('marks a rejected op dead at the inclusive attempt threshold', () => {
    insertOutboxRow({
      opId: 'op-threshold',
      status: OUTBOX_STATUS.IN_FLIGHT,
      attemptCount: 9,
      nextAttemptAt: '2026-05-13T12:05:00.000Z',
    });

    markOutboxOpRejected(
      'op-threshold',
      'sync op rejected: immutable field',
      () => '2026-05-13T12:10:00.000Z',
    );

    expect(readOutboxRow('op-threshold')).toEqual(
      expect.objectContaining({
        status: OUTBOX_STATUS.DEAD,
        attempt_count: 10,
        last_error: 'sync op rejected: immutable field',
        next_attempt_at: null,
      }),
    );
  });

  it('leaves an already dead row unchanged when rejected handling is called again', () => {
    insertOutboxRow({
      opId: 'op-dead',
      status: OUTBOX_STATUS.DEAD,
      attemptCount: 10,
      nextAttemptAt: null,
      updatedAt: '2026-05-13T12:30:00.000Z',
    });

    markOutboxOpRejected(
      'op-dead',
      'sync op rejected: still bad',
      () => '2026-05-13T12:35:00.000Z',
    );

    expect(readOutboxRow('op-dead')).toEqual({
      status: OUTBOX_STATUS.DEAD,
      attempt_count: 10,
      last_error: null,
      next_attempt_at: null,
      updated_at: '2026-05-13T12:30:00.000Z',
    });
  });

  it('does not modify an acked row when rejected handling is called', () => {
    insertOutboxRow({
      opId: 'op-acked',
      status: OUTBOX_STATUS.ACKED,
      attemptCount: 4,
      nextAttemptAt: '2026-05-13T12:05:00.000Z',
      updatedAt: '2026-05-13T12:40:00.000Z',
    });

    markOutboxOpRejected(
      'op-acked',
      'sync op rejected: should not apply',
      () => '2026-05-13T12:45:00.000Z',
    );

    expect(readOutboxRow('op-acked')).toEqual({
      status: OUTBOX_STATUS.ACKED,
      attempt_count: 4,
      last_error: null,
      next_attempt_at: '2026-05-13T12:05:00.000Z',
      updated_at: '2026-05-13T12:40:00.000Z',
    });
  });

  it('lists only due pending and failed ops while excluding dead rows', () => {
    insertOutboxRow({
      opId: 'op-dead-oldest',
      status: OUTBOX_STATUS.DEAD,
      attemptCount: 10,
      createdAt: '2026-05-13T12:00:00.000Z',
    });
    insertOutboxRow({
      opId: 'op-pending',
      status: OUTBOX_STATUS.PENDING,
      createdAt: '2026-05-13T12:01:00.000Z',
    });
    insertOutboxRow({
      opId: 'op-failed-due',
      status: OUTBOX_STATUS.FAILED,
      nextAttemptAt: '2000-01-01T00:00:00.000Z',
      createdAt: '2026-05-13T12:02:00.000Z',
    });
    insertOutboxRow({
      opId: 'op-failed-future',
      status: OUTBOX_STATUS.FAILED,
      nextAttemptAt: '2999-01-01T00:00:00.000Z',
      createdAt: '2026-05-13T12:03:00.000Z',
    });
    insertOutboxRow({
      opId: 'op-acked',
      status: OUTBOX_STATUS.ACKED,
      createdAt: '2026-05-13T12:04:00.000Z',
    });

    expect(listPendingOutboxOps(10).map((op) => op.op_id)).toEqual(['op-pending', 'op-failed-due']);
  });
});
