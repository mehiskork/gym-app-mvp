import { exec, query } from './db';
import { newId } from '../utils/ids';
import { getGuestUserId, getOrCreateDeviceId, getOrCreateLocalUserId } from './appMetaRepo';

export type OutboxOp = {
  id: string;
  op_id: string;
  device_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  op_type: 'upsert' | 'delete';
  payload_json: string;
  status: 'pending' | 'acked' | 'failed';
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'));
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
      created_at,
      updated_at
    FROM outbox_op
    WHERE status IN ('pending', 'failed')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT ?;
  `,
    [limit],
  );
}

export function markOutboxOpsAcked(opIds: string[]) {
  if (opIds.length === 0) return;

  const placeholders = opIds.map(() => '?').join(', ');
  exec(
    `
    UPDATE outbox_op
    SET status = 'acked', updated_at = datetime('now')
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
      status = 'failed',
      attempt_count = attempt_count + 1,
      last_error = ?,
      next_attempt_at = ?,
      updated_at = datetime('now')
    WHERE op_id = ?;
  `,
    [error, nextAttemptAt, opId],
  );
}
