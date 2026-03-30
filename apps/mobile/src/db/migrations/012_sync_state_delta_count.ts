import type { Migration } from './index';

export const migration012_sync_state_delta_count: Migration = {
  id: 12,
  name: 'sync state last delta count',
  up: `
    ALTER TABLE sync_state ADD COLUMN last_delta_count INTEGER NOT NULL DEFAULT 0;
  `,
};
