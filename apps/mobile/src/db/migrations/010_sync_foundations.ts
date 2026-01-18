import type { Migration } from './index';

export const migration010_sync_foundations: Migration = {
  id: 10,
  name: 'sync foundations (outbox + sync_state)',
  up: `
    CREATE TABLE IF NOT EXISTS outbox_op (
      id TEXT PRIMARY KEY NOT NULL,
      op_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_op_op_id ON outbox_op(op_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_op_status_created ON outbox_op(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_outbox_op_entity ON outbox_op(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      cursor TEXT,
      last_sync_at TEXT,
      last_error TEXT,
      backoff_until TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sync_state (id) VALUES (1);
  `,
};
