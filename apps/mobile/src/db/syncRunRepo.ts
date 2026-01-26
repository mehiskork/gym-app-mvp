import * as SQLite from 'expo-sqlite';
import { exec, query } from './db';
import { newId } from '../utils/ids';

export type SyncRunStatus = 'success' | 'failed';

export type SyncRun = {
    id: string;
    started_at: string;
    ended_at: string | null;
    status: SyncRunStatus;
    cursor_before: string | null;
    cursor_after: string | null;
    ops_sent: number;
    acks_applied: number;
    acks_noop: number;
    acks_rejected: number;
    deltas_received: number;
    deltas_applied: number;
    http_status: number | null;
    error_code: string | null;
    error_message: string | null;
    backoff_seconds: number | null;
    created_at: string;
};

const MAX_ERROR_MESSAGE_LENGTH = 300;

function truncateErrorMessage(message: string | null | undefined): string | null {
    if (!message) return null;
    if (message.length <= MAX_ERROR_MESSAGE_LENGTH) return message;
    return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`;
}

export function createSyncRun(input: { cursorBefore?: string | null }): string {
    const id = newId('sr');
    exec(
        `
    INSERT INTO sync_run (
      id,
      status,
      cursor_before
    ) VALUES (?, 'failed', ?);
  `,
        [id, input.cursorBefore ?? null],
    );
    return id;
}

export type FinishSyncRunInput = {
    status: SyncRunStatus;
    cursorAfter?: string | null;
    opsSent?: number;
    acksApplied?: number;
    acksNoop?: number;
    acksRejected?: number;
    deltasReceived?: number;
    deltasApplied?: number;
    httpStatus?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    backoffSeconds?: number | null;
};

export function finishSyncRun(runId: string, input: FinishSyncRunInput): void {
    const updates: Array<[string, SQLite.SQLiteBindValue]> = [];
    const pushUpdate = (column: string, value: SQLite.SQLiteBindValue | undefined) => {
        if (value === undefined) return;
        updates.push([column, value]);
    };
    const pushNumber = (column: string, value: number | null | undefined) => {
        if (typeof value !== 'number') return;
        updates.push([column, value]);
    };

    pushUpdate('status', input.status ?? 'failed');
    pushUpdate('cursor_after', input.cursorAfter);
    pushNumber('ops_sent', input.opsSent);
    pushNumber('acks_applied', input.acksApplied);
    pushNumber('acks_noop', input.acksNoop);
    pushNumber('acks_rejected', input.acksRejected);
    pushNumber('deltas_received', input.deltasReceived);
    pushNumber('deltas_applied', input.deltasApplied);
    pushNumber('http_status', input.httpStatus);
    pushUpdate('error_code', input.errorCode);
    pushUpdate('error_message', truncateErrorMessage(input.errorMessage));
    pushNumber('backoff_seconds', input.backoffSeconds);

    const columns: string[] = [`ended_at = datetime('now')`];
    const values: SQLite.SQLiteBindValue[] = [];

    for (const [column, value] of updates) {
        columns.push(`${column} = ?`);
        values.push(value);
    }

    exec(
        `
    UPDATE sync_run
    SET ${columns.join(', ')}
    WHERE id = ?;
  `,
        [...values, runId],
    );
}

export function listSyncRuns(limit = 20): SyncRun[] {
    return query<SyncRun>(
        `
    SELECT
      id,
      started_at,
      ended_at,
      status,
      cursor_before,
      cursor_after,
      ops_sent,
      acks_applied,
      acks_noop,
      acks_rejected,
      deltas_received,
      deltas_applied,
      http_status,
      error_code,
      error_message,
      backoff_seconds,
      created_at
    FROM sync_run
    ORDER BY started_at DESC
    LIMIT ?;
  `,
        [limit],
    );
}

export function clearSyncRuns(): void {
    exec(`DELETE FROM sync_run;`);
}