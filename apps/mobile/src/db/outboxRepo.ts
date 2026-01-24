import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { getGuestUserId, getOrCreateDeviceId, getOrCreateLocalUserId } from './appMetaRepo';
import { OUTBOX_STATUS, type OutboxStatus } from './constants';

export type OutboxOp = {
  id: string;
  op_id: string;
  device_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  op_type: 'upsert' | 'delete';
  payload_json: string;
  status: OutboxStatus;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  updated_at: string;
};

export type EnqueueOutboxInput = {
  entityType: string;
  entityId: string;
  opType: 'upsert' | 'delete';
  payloadJson: string;
};

export function enqueueOutboxOp(input: EnqueueOutboxInput): string {
  const id = newId('outbox');
  const opId = newId('op');
  const deviceId = getOrCreateDeviceId();
  const userId = getGuestUserId() ?? getOrCreateLocalUserId();

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
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '${OUTBOX_STATUS.PENDING}', datetime('now'), datetime('now'));
  `,
    [id, opId, deviceId, userId, input.entityType, input.entityId, input.opType, input.payloadJson],
  );

  return id;
}

export function listPendingOutboxOps(limit: number): OutboxOp[] {
  return query<OutboxOp>(
    `
    SELECT
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
      last_error,
      next_attempt_at,
      last_attempt_at,
      created_at,
      updated_at
    FROM outbox_op
    WHERE status IN ('${OUTBOX_STATUS.PENDING}', '${OUTBOX_STATUS.FAILED}')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT ?;
  `,
    [limit],
  );
}

export function claimOutboxOps(limit: number): OutboxOp[] {
  return inTransaction(() => {
    const ops = listPendingOutboxOps(limit);
    if (ops.length === 0) return [];

    const opIds = ops.map((op) => op.op_id);
    const placeholders = opIds.map(() => '?').join(', ');
    exec(
      `
      UPDATE outbox_op
      SET status = '${OUTBOX_STATUS.IN_FLIGHT}',
          last_attempt_at = datetime('now'),
          updated_at = datetime('now')
      WHERE op_id IN (${placeholders});
    `,
      opIds,
    );

    return ops;
  });
}


export function markOutboxOpsAcked(opIds: string[]) {
  if (opIds.length === 0) return;

  const placeholders = opIds.map(() => '?').join(', ');
  exec(
    `
    UPDATE outbox_op
    SET status = '${OUTBOX_STATUS.ACKED}', updated_at = datetime('now')
    WHERE op_id IN (${placeholders});
  `,
    opIds,
  );
}

export function markOutboxOpFailed(opId: string, error: string, nextAttemptAt: string) {
  exec(
    `
    UPDATE outbox_op
    SET
      status = '${OUTBOX_STATUS.FAILED}',
      attempt_count = attempt_count + 1,
      last_error = ?,
      next_attempt_at = ?,
      updated_at = datetime('now')
    WHERE op_id = ?;
  `,
    [error, nextAttemptAt, opId],
  );
}

export function markOutboxOpsFailed(
  ops: Array<Pick<OutboxOp, 'op_id' | 'attempt_count'>>,
  error: string,
  computeNextAttemptAt: (attemptCount: number) => string,
): void {
  if (ops.length === 0) return;

  for (const op of ops) {
    const nextAttemptAt = computeNextAttemptAt(op.attempt_count + 1);
    markOutboxOpFailed(op.op_id, error, nextAttemptAt);
  }
}

export function repairStaleInFlightOps(maxAgeSeconds: number): number {
  const staleBefore = `-${maxAgeSeconds} seconds`;
  const row = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM outbox_op
    WHERE status = '${OUTBOX_STATUS.IN_FLIGHT}'
      AND last_attempt_at IS NOT NULL
      AND datetime(last_attempt_at) <= datetime('now', ?);
  `,
    [staleBefore],
  )[0];

  exec(
    `
    UPDATE outbox_op
    SET
      status = '${OUTBOX_STATUS.FAILED}',
      attempt_count = attempt_count + 1,
      last_error = ?,
      next_attempt_at = datetime('now'),
      updated_at = datetime('now')
    WHERE status = '${OUTBOX_STATUS.IN_FLIGHT}'
      AND last_attempt_at IS NOT NULL
      AND datetime(last_attempt_at) <= datetime('now', ?);
  `,
    ['stale in_flight repaired', staleBefore],
  );

  return row?.c ?? 0;
}

export function clearOutboxAndSyncState(): void {
  inTransaction(() => {
    exec(`DELETE FROM outbox_op;`);
    exec(
      `
      UPDATE sync_state
      SET cursor = NULL,
          last_sync_at = NULL,
          last_error = NULL,
          backoff_until = NULL,
          consecutive_failures = 0
          last_delta_count = 0
      WHERE id = 1;
    `,
    );
  });
}
