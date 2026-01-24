import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { getDeviceToken, getGuestUserId, getOrCreateDeviceId } from './appMetaRepo';
import { clearOutboxAndSyncState, repairStaleInFlightOps } from './outboxRepo';
import { getSyncState } from './syncStateRepo';
import { OUTBOX_STATUS, WORKOUT_SESSION_STATUS } from './constants';

export type TableCounts = Record<string, number>;

export function getTableCounts(): TableCounts {
  const tables = [
    'program',
    'program_week',
    'program_day',
    'program_day_exercise',
    'planned_set',
    'exercise',
    'workout_session',
    'workout_session_exercise',
    'workout_set',
    'pr_event',
    'app_log',
  ];

  const counts: TableCounts = {};
  for (const t of tables) {
    try {
      const row = query<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t}`)[0];
      counts[t] = row?.c ?? 0;
    } catch {
      counts[t] = -1;
    }
  }
  return counts;
}

export type InProgressWorkout = {
  sessionId: string;
  startedAt: number | null;
  setCount: number;
} | null;

export function getInProgressWorkout(): InProgressWorkout {
  const session = query<{ id: string; started_at: string }>(
    `
    SELECT id, started_at
    FROM workout_session
    WHERE status = '${WORKOUT_SESSION_STATUS.IN_PROGRESS}' AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;
  `,
  )[0];

  if (!session) return null;

  const setRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM workout_set ws
    JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
    WHERE wse.workout_session_id = ?;
  `,
    [session.id],
  )[0];

  return {
    sessionId: session.id,
    startedAt: session.started_at ? Date.parse(session.started_at) : null,
    setCount: setRow?.c ?? 0,
  };
}

export function resetInProgressWorkoutHardDelete(): void {
  inTransaction<void>(() => {
    const session = query<{ id: string }>(
      `
      SELECT id
      FROM workout_session
      WHERE status = '${WORKOUT_SESSION_STATUS.IN_PROGRESS}' AND deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1;
    `,
    )[0];

    if (!session) return;

    exec(
      `
      DELETE FROM workout_set
      WHERE workout_session_exercise_id IN (
        SELECT id FROM workout_session_exercise WHERE workout_session_id = ?
      );
    `,
      [session.id],
    );
    exec(`DELETE FROM workout_session_exercise WHERE workout_session_id = ?`, [session.id]);
    exec(`DELETE FROM workout_session WHERE id = ?`, [session.id]);
  });
}

export function repairSessionsMissingSets(): number {
  return inTransaction<number>(() => {
    const missing = query<{ id: string }>(
      `
      SELECT wse.id
      FROM workout_session_exercise wse
      WHERE wse.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM workout_set ws
          WHERE ws.workout_session_exercise_id = wse.id
            AND ws.deleted_at IS NULL
        );
    `,
    );

    for (const row of missing) {
      exec(
        `
        INSERT INTO workout_set (
          id, workout_session_exercise_id, set_index,
          weight, reps, rpe, rest_seconds, notes, is_completed
        ) VALUES (?, ?, 1, 0, 0, NULL, 90, NULL, 0);
      `,
        [newId('set'), row.id],
      );
    }

    return missing.length;
  });
}

export function repairStaleInFlightOpsForDebug(maxAgeSeconds: number): number {
  return repairStaleInFlightOps(maxAgeSeconds);
}

export function clearOutboxForDebug(): void {
  clearOutboxAndSyncState();
}

export function testNestedTransactionRollback(): { ok: boolean; message: string } {
  const key = `__tx_sanity_${Date.now()}`;
  let caught = false;

  try {
    inTransaction(() => {
      exec(
        `
        INSERT INTO app_meta (key, value, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'));
      `,
        [key, 'outer'],
      );

      inTransaction(() => {
        exec(`UPDATE app_meta SET value = ? WHERE key = ?`, ['inner', key]);
        throw new Error('nested transaction sanity check');
      });
    });
  } catch {
    caught = true;
  }

  const row = query<{ c: number }>(`SELECT COUNT(*) AS c FROM app_meta WHERE key = ?`, [key])[0];
  const exists = (row?.c ?? 0) > 0;

  if (exists) {
    exec(`DELETE FROM app_meta WHERE key = ?`, [key]);
  }

  const ok = caught && !exists;
  const message = ok
    ? 'Nested transaction rollback succeeded.'
    : `Nested transaction rollback failed (caught=${caught}, exists=${exists}).`;

  return { ok, message };
}

export function validateStatusEnums(): { ok: boolean; message: string } {
  const workoutStatuses = query<{ status: string }>(
    `
    SELECT DISTINCT status
    FROM workout_session
    WHERE status IS NOT NULL
    LIMIT 20;
  `,
  ).map((row) => row.status);

  const outboxStatuses = query<{ status: string }>(
    `
    SELECT DISTINCT status
    FROM outbox_op
    WHERE status IS NOT NULL
    LIMIT 20;
  `,
  ).map((row) => row.status);

  const allowedWorkout = new Set<string>(Object.values(WORKOUT_SESSION_STATUS));
  const allowedOutbox = new Set<string>(Object.values(OUTBOX_STATUS));

  const invalidWorkout = workoutStatuses.filter((status) => !allowedWorkout.has(status));
  const invalidOutbox = outboxStatuses.filter((status) => !allowedOutbox.has(status));

  const ok = invalidWorkout.length === 0 && invalidOutbox.length === 0;
  const message = ok
    ? 'Status enums validated.'
    : `Invalid statuses found. workout_session: ${invalidWorkout.join(', ') || 'none'}, outbox_op: ${
        invalidOutbox.join(', ') || 'none'
      }`;

  return { ok, message };
}


export function resetSyncCursorForDebug(): void {
  exec(
    `
    UPDATE sync_state
    SET cursor = '0',
        last_sync_at = NULL,
        last_error = NULL,
        last_delta_count = 0
    WHERE id = 1;
  `,
  );
}
export type SyncDebugInfo = {
  deviceId: string;
  hasDeviceToken: boolean;
  guestUserId: string | null;
  outboxTotalCount: number;
  outboxStatusCounts: Record<string, number>;
  dueNowCount: number;
  recentOutboxOps: Array<{
    op_id: string;
    status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    created_at: string;
    last_error: string | null;
  }>;
  syncState: ReturnType<typeof getSyncState>;
};

export function getSyncDebugInfo(): SyncDebugInfo {
  const deviceId = getOrCreateDeviceId();
  const hasDeviceToken = Boolean(getDeviceToken());
  const guestUserId = getGuestUserId();
  const totalRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM outbox_op
    WHERE status IN (
      '${OUTBOX_STATUS.PENDING}',
      '${OUTBOX_STATUS.FAILED}',
      '${OUTBOX_STATUS.IN_FLIGHT}',
      '${OUTBOX_STATUS.ACKED}'
    );
  `,
  )[0];

  const statusRows = query<{ status: string; c: number }>(
    `
    SELECT status, COUNT(*) AS c
    FROM outbox_op
    GROUP BY status;
  `,
  );

  const dueRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM outbox_op
    WHERE status IN ('${OUTBOX_STATUS.PENDING}', '${OUTBOX_STATUS.FAILED}');
  `,
  )[0];

  const recentOps = query<{
    op_id: string;
    status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    created_at: string;
    last_error: string | null;
  }>(
    `
    SELECT
      op_id,
      status,
      attempt_count,
      next_attempt_at,
      created_at,
      last_error
    FROM outbox_op
    ORDER BY created_at DESC
    LIMIT 10;
  `,
  );

  const outboxStatusCounts: Record<string, number> = {
    [OUTBOX_STATUS.PENDING]: 0,
    [OUTBOX_STATUS.FAILED]: 0,
    [OUTBOX_STATUS.IN_FLIGHT]: 0,
    [OUTBOX_STATUS.ACKED]: 0,
  };
  for (const row of statusRows) {
    outboxStatusCounts[row.status] = row.c;
  }


  return {
    deviceId,
    hasDeviceToken,
    guestUserId,
    outboxTotalCount: totalRow?.c ?? 0,
    outboxStatusCounts,
    dueNowCount: dueRow?.c ?? 0,
    recentOutboxOps: recentOps,
    syncState: getSyncState(),
  };
}
