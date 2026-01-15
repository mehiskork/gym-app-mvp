import type { Migration } from './index';

export const migration008_app_meta: Migration = {
  id: 8,
  name: 'add app_meta',
  up: `
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};
