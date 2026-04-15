import * as Application from 'expo-application';
import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import {
  getAuthDebugState,
  getEffectiveUserId,
  getGuestUserId,
  getMeta,
  getLastSyncAckSummary,
  getOrCreateDeviceId,
} from './appMetaRepo';
import { clearOutboxAndSyncState, repairStaleInFlightOps } from './outboxRepo';
import { getSyncState } from './syncStateRepo';
import { DEFAULT_REST_SECONDS, OUTBOX_STATUS, WORKOUT_SESSION_STATUS } from './constants';
import { weekStartExpression } from './dateSql';
import { listSyncRuns, type SyncRun } from './syncRunRepo';

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
    'sync_run',
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
      AND wse.exercise_type = 'strength'
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
        ) VALUES (?, ?, 1, 0, 0, NULL, ?, NULL, 0);
      `,
        [newId('set'), row.id, DEFAULT_REST_SECONDS],
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
    : `Invalid statuses found. workout_session: ${invalidWorkout.join(', ') || 'none'}, outbox_op: ${invalidOutbox.join(', ') || 'none'
    }`;

  return { ok, message };
}

export function verifySyncState(): { ok: boolean; message: string; missingColumns: string[] } {
  const columns = query<{ name: string }>(`PRAGMA table_info(sync_state);`).map((row) => row.name);
  const required = [
    'id',
    'cursor',
    'last_sync_at',
    'last_error',
    'backoff_until',
    'consecutive_failures',
    'last_delta_count',
  ];

  const missingColumns = required.filter((name) => !columns.includes(name));

  const cursorRow = query<{ cursor: string | null }>(
    `
    SELECT cursor
    FROM sync_state
    WHERE id = 1
    LIMIT 1;
  `,
  )[0];

  const cursor = cursorRow?.cursor ?? null;
  const cursorValid = cursor === null || /^\d+$/.test(cursor);

  const ok = missingColumns.length === 0 && cursorValid;
  const message = ok
    ? 'sync_state schema ok.'
    : `sync_state issue: missing [${missingColumns.join(', ') || 'none'}], cursor="${cursor ?? 'null'
    }"`;

  return { ok, message, missingColumns };
}

export type WorkoutSessionExerciseSchemaHealth = {
  ok: boolean;
  message: string;
  missingColumns: string[];
  hasLegacyCardioDurationSeconds: boolean;
};

export function getWorkoutSessionExerciseSchemaHealth(): WorkoutSessionExerciseSchemaHealth {
  const columns = query<{ name: string }>(`PRAGMA table_info(workout_session_exercise);`).map(
    (row) => row.name,
  );

  const required = [
    'exercise_type',
    'cardio_profile',
    'cardio_duration_minutes',
    'cardio_distance_km',
    'cardio_speed_kph',
    'cardio_incline_percent',
    'cardio_resistance_level',
    'cardio_pace_seconds_per_km',
    'cardio_floors',
    'cardio_stair_level',
    'notes',
  ];
  const missingColumns = required.filter((name) => !columns.includes(name));
  const hasLegacyCardioDurationSeconds = columns.includes('cardio_duration_seconds');
  const ok = missingColumns.length === 0 && !hasLegacyCardioDurationSeconds;
  const message = ok
    ? 'workout_session_exercise cardio schema ok.'
    : `workout_session_exercise schema issue: missing [${missingColumns.join(', ') || 'none'}], legacy cardio_duration_seconds=${hasLegacyCardioDurationSeconds}`;

  return { ok, message, missingColumns, hasLegacyCardioDurationSeconds };
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
  guestUserId: string | null;
  effectiveUserId: string;
  authDebug: ReturnType<typeof getAuthDebugState>;
  lastSyncAckSummary: ReturnType<typeof getLastSyncAckSummary>;
  pendingOpsCount: number;
  outboxHistoryTotalCount: number;
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

export type SupportBundle = {
  exportedAt: string;
  app: {
    applicationId: string | null;
    applicationName: string | null;
    nativeApplicationVersion: string | null;
    nativeBuildVersion: string | null;
  };
  device: {
    deviceId: string;
    guestUserId: string | null;
    localUserId: string | null;
  };
  auth: ReturnType<typeof getAuthDebugState>;
  syncState: ReturnType<typeof getSyncState>;
  outbox: {
    totalCount: number;
    byStatus: Record<string, number>;
    dueNowCount: number;
    recentOps: Array<{
      opId: string;
      entityType: string;
      entityId: string;
      opType: string;
      status: string;
      attemptCount: number;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  syncRuns: SyncRun[];
  tableCounts: TableCounts;
};

export type WeekStartDebugInfo = {
  weekStartNow: string;
  recentWeekBuckets: Array<{ week_start: string; sessions: number }>;
};

export function getWeekStartDebugInfo(): WeekStartDebugInfo {
  const weekStartNowExpr = weekStartExpression("date('now')");
  const weekStartNowRow = query<{ week_start: string }>(
    `
    SELECT ${weekStartNowExpr} AS week_start;
  `,
  )[0];

  const weekStartBySessionExpr = weekStartExpression('ws.started_at');
  const recentWeekBuckets = query<{ week_start: string; sessions: number }>(
    `
    SELECT
      ${weekStartBySessionExpr} AS week_start,
      COUNT(*) AS sessions
    FROM workout_session ws
    WHERE ws.deleted_at IS NULL
      AND ws.status = '${WORKOUT_SESSION_STATUS.COMPLETED}'
    GROUP BY week_start
    ORDER BY week_start DESC
    LIMIT 6;
  `,
  );

  return {
    weekStartNow: weekStartNowRow?.week_start ?? '',
    recentWeekBuckets,
  };
}

export function getSyncDebugInfo(): SyncDebugInfo {
  const deviceId = getOrCreateDeviceId();
  const guestUserId = getGuestUserId();
  const effectiveUserId = getEffectiveUserId();
  const authDebug = getAuthDebugState();
  const historyTotalRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM outbox_op
     ;
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
  const pendingOpsCount =
    outboxStatusCounts[OUTBOX_STATUS.PENDING] +
    outboxStatusCounts[OUTBOX_STATUS.FAILED] +
    outboxStatusCounts[OUTBOX_STATUS.IN_FLIGHT];

  return {
    deviceId,
    guestUserId,
    effectiveUserId,
    authDebug,
    lastSyncAckSummary: getLastSyncAckSummary(),
    pendingOpsCount,
    outboxHistoryTotalCount: historyTotalRow?.c ?? 0,
    outboxStatusCounts,
    dueNowCount: dueRow?.c ?? 0,
    recentOutboxOps: recentOps,
    syncState: getSyncState(),
  };
}
export function getSupportBundle(): SupportBundle {
  const deviceId = getOrCreateDeviceId();
  const guestUserId = getMeta('guest_user_id');
  const localUserId = getMeta('local_user_id');

  const totalRow = query<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_op;`)[0];
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
    WHERE status IN ('${OUTBOX_STATUS.PENDING}', '${OUTBOX_STATUS.FAILED}')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'));
  `,
  )[0];
  const recentOps = query<{
    op_id: string;
    entity_type: string;
    entity_id: string;
    op_type: string;
    status: string;
    attempt_count: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
    SELECT
      op_id,
      entity_type,
      entity_id,
      op_type,
      status,
      attempt_count,
      last_error,
      created_at,
      updated_at
    FROM outbox_op
    ORDER BY created_at DESC
    LIMIT 50;
  `,
  );

  const outboxStatusCounts: Record<string, number> = {};
  for (const row of statusRows) {
    outboxStatusCounts[row.status] = row.c;
  }

  return {
    exportedAt: new Date().toISOString(),
    app: {
      applicationId: Application.applicationId ?? null,
      applicationName: Application.applicationName ?? null,
      nativeApplicationVersion: Application.nativeApplicationVersion ?? null,
      nativeBuildVersion: Application.nativeBuildVersion ?? null,
    },
    device: {
      deviceId,
      guestUserId,
      localUserId,
    },
    auth: getAuthDebugState(),
    syncState: getSyncState(),
    outbox: {
      totalCount: totalRow?.c ?? 0,
      byStatus: outboxStatusCounts,
      dueNowCount: dueRow?.c ?? 0,
      recentOps: recentOps.map((op) => ({
        opId: op.op_id,
        entityType: op.entity_type,
        entityId: op.entity_id,
        opType: op.op_type,
        status: op.status,
        attemptCount: op.attempt_count,
        lastError: op.last_error,
        createdAt: op.created_at,
        updatedAt: op.updated_at,
      })),
    },
    syncRuns: listSyncRuns(20),
    tableCounts: getTableCounts(),
  };
}
