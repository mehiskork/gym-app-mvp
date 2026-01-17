import type { Migration } from './index';

export const migration009_app_log: Migration = {
  id: 9,
  name: 'add app_log table',
  up: `
    CREATE TABLE IF NOT EXISTS app_log (
      id INTEGER PRIMARY KEY NOT NULL,
      at INTEGER NOT NULL,
      level TEXT NOT NULL,
      tag TEXT NOT NULL,
      message TEXT NOT NULL,
      context_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_app_log_at ON app_log(at);
  `,
};
