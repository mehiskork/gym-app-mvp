import { exec, query } from './db';
import { logEvent } from '../utils/logger';

export type SyncState = {
  id: number;
  cursor: string;
  last_sync_at: string | null;
  last_error: string | null;
  backoff_until: string | null;
  consecutive_failures: number;
  last_delta_count: number;
};

export function normalizeCursor(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '0';
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    if (__DEV__) {
      logEvent('error', 'sync', 'Invalid cursor value; resetting to 0', { value });
    }
    return '0';
  }

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
      cursor: '0',
      last_sync_at: null,
      last_error: null,
      backoff_until: null,
      consecutive_failures: 0,
      last_delta_count: 0,
    };
  }

  return {
    ...row,
    cursor: normalizeCursor(row.cursor),
  };
}

export function updateSyncState(patch: Partial<Omit<SyncState, 'id'>>) {
  const normalizedPatch = { ...patch };
  if ('cursor' in normalizedPatch) {
    normalizedPatch.cursor = normalizeCursor(normalizedPatch.cursor);
  }
  const entries = Object.entries(normalizedPatch).filter(([, value]) => value !== undefined);
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
