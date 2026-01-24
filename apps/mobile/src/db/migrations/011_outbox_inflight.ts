import type { Migration } from './index';

export const migration011_outbox_inflight: Migration = {
    id: 11,
    name: 'outbox in-flight tracking',
    up: `
    ALTER TABLE outbox_op ADD COLUMN last_attempt_at TEXT;
    CREATE INDEX IF NOT EXISTS idx_outbox_op_status_next_attempt ON outbox_op(status, next_attempt_at);
  `,
};