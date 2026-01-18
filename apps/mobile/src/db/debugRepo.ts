import { exec, query } from './db';
import { inTransaction } from './tx';
import { newId } from '../utils/ids';
import { getDeviceToken, getGuestUserId, getOrCreateDeviceId } from './appMetaRepo';
import { getSyncState } from './syncStateRepo';

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
    WHERE status = 'in_progress' AND deleted_at IS NULL
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
      WHERE status = 'in_progress' AND deleted_at IS NULL
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
export type SyncDebugInfo = {
  deviceId: string;
  hasDeviceToken: boolean;
  guestUserId: string | null;
  pendingOutboxCount: number;
  syncState: ReturnType<typeof getSyncState>;
};

export function getSyncDebugInfo(): SyncDebugInfo {
  const deviceId = getOrCreateDeviceId();
  const hasDeviceToken = Boolean(getDeviceToken());
  const guestUserId = getGuestUserId();
  const pendingRow = query<{ c: number }>(
    `
    SELECT COUNT(*) AS c
    FROM outbox_op
    WHERE status IN ('pending', 'failed')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now'));
  `,
  )[0];

  return {
    deviceId,
    hasDeviceToken,
    guestUserId,
    pendingOutboxCount: pendingRow?.c ?? 0,
    syncState: getSyncState(),
  };
}
