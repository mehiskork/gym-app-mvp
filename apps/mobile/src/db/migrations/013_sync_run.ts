import type { Migration } from './index';

export const migration013_sync_run: Migration = {
  id: 13,
  name: 'sync run tracking',
  up: `
    CREATE TABLE IF NOT EXISTS sync_run (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      cursor_before TEXT NULL,
      cursor_after TEXT NULL,
      ops_sent INTEGER NOT NULL DEFAULT 0,
      acks_applied INTEGER NOT NULL DEFAULT 0,
      acks_noop INTEGER NOT NULL DEFAULT 0,
      acks_rejected INTEGER NOT NULL DEFAULT 0,
      deltas_received INTEGER NOT NULL DEFAULT 0,
      deltas_applied INTEGER NOT NULL DEFAULT 0,
      http_status INTEGER NULL,
      error_code TEXT NULL,
      error_message TEXT NULL,
      backoff_seconds INTEGER NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS sync_run_started_at_idx
      ON sync_run (started_at DESC);
    CREATE INDEX IF NOT EXISTS sync_run_status_started_at_idx
      ON sync_run (status, started_at DESC);
  `,
};
