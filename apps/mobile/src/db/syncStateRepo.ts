import { exec, query } from './db';

export type SyncState = {
  id: number;
  cursor: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  backoff_until: string | null;
  consecutive_failures: number;
  last_delta_count: number;
};

export function normalizeCursor(value?: string | number | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  return String(Math.trunc(asNumber));
}


export function getSyncState(): SyncState {
  const row = query<SyncState>(
    `
    SELECT
      id,
      cursor,
      last_sync_at,
      last_error,
      backoff_until,
      consecutive_failures,
      last_delta_count
    FROM sync_state
    WHERE id = 1
    LIMIT 1;
  `,
  )[0];

  if (!row) {
    exec(`INSERT OR IGNORE INTO sync_state (id) VALUES (1);`);
    return {
      id: 1,
      cursor: null,
      last_sync_at: null,
      last_error: null,
      backoff_until: null,
      consecutive_failures: 0,
      last_delta_count: 0,
    };
  }

  return row;
}

export function updateSyncState(patch: Partial<Omit<SyncState, 'id'>>) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const columns = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  exec(
    `
    UPDATE sync_state
    SET ${columns}
    WHERE id = 1;
  `,
    values,
  );
}
