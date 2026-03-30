import type * as SQLite from 'expo-sqlite';
import { exec, query } from '../db/db';
import { logEvent } from '../utils/logger';
import { parseTimestampMs } from '../utils/timestamp';

export type SyncDelta = {
  entityType: string;
  entityId: string;
  opType: string;
  payload: unknown;
  changeId?: number;
};

type TableConfig = {
  tableName: string;
  primaryKey: string;
  columns: string[];
  hasDeletedAt: boolean;
  hasVersion: boolean;
  order: number;
};

const tableConfigs: Record<string, TableConfig> = {
  program: {
    tableName: 'program',
    primaryKey: 'id',
    columns: [
      'id',
      'name',
      'description',
      'is_template',
      'owner_user_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 10,
  },
  program_week: {
    tableName: 'program_week',
    primaryKey: 'id',
    columns: [
      'id',
      'program_id',
      'week_index',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 20,
  },
  program_day: {
    tableName: 'program_day',
    primaryKey: 'id',
    columns: [
      'id',
      'program_week_id',
      'day_index',
      'name',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 30,
  },
  exercise: {
    tableName: 'exercise',
    primaryKey: 'id',
    columns: [
      'id',
      'name',
      'normalized_name',
      'is_custom',
      'owner_user_id',
      'equipment',
      'primary_muscle',
      'notes',
      'exercise_type',
      'cardio_profile',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 40,
  },
  program_day_exercise: {
    tableName: 'program_day_exercise',
    primaryKey: 'id',
    columns: [
      'id',
      'program_day_id',
      'exercise_id',
      'position',
      'notes',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 50,
  },
  planned_set: {
    tableName: 'planned_set',
    primaryKey: 'id',
    columns: [
      'id',
      'program_day_exercise_id',
      'set_index',
      'target_reps_min',
      'target_reps_max',
      'target_rpe',
      'target_weight',
      'rest_seconds',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 60,
  },
  workout_session: {
    tableName: 'workout_session',
    primaryKey: 'id',
    columns: [
      'id',
      'source_workout_plan_id',
      'source_program_day_id',
      'title',
      'status',
      'started_at',
      'ended_at',
      'workout_note',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    hasDeletedAt: true,
    hasVersion: false,
    order: 70,
  },
  workout_session_exercise: {
    tableName: 'workout_session_exercise',
    primaryKey: 'id',
    columns: [
      'id',
      'workout_session_id',
      'source_program_day_exercise_id',
      'exercise_id',
      'exercise_name',
      'exercise_type',
      'cardio_profile',
      'position',
      'notes',
      'cardio_duration_minutes',
      'cardio_distance_km',
      'cardio_speed_kph',
      'cardio_incline_percent',
      'cardio_resistance_level',
      'cardio_pace_seconds_per_km',
      'cardio_floors',
      'cardio_stair_level',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    hasDeletedAt: true,
    hasVersion: false,
    order: 80,
  },
  workout_set: {
    tableName: 'workout_set',
    primaryKey: 'id',
    columns: [
      'id',
      'workout_session_exercise_id',
      'set_index',
      'weight',
      'reps',
      'rpe',
      'rest_seconds',
      'notes',
      'is_completed',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    hasDeletedAt: true,
    hasVersion: false,
    order: 90,
  },
  pr_event: {
    tableName: 'pr_event',
    primaryKey: 'id',
    columns: [
      'id',
      'session_id',
      'exercise_id',
      'pr_type',
      'context',
      'value',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    hasDeletedAt: true,
    hasVersion: false,
    order: 100,
  },
  app_meta: {
    tableName: 'app_meta',
    primaryKey: 'key',
    columns: ['key', 'value', 'created_at', 'updated_at'],
    hasDeletedAt: false,
    hasVersion: false,
    order: 110,
  },
};

type DeltaOutcome = 'applied' | 'skipped';

function normalizePayload(
  payload: unknown,
  entityId: string,
  config: TableConfig,
): Record<string, unknown> {
  const base =
    payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};
  if (base[config.primaryKey] === undefined || base[config.primaryKey] === null) {
    base[config.primaryKey] = entityId;
  }
  return base;
}

function parseUpdatedAt(payload: Record<string, unknown>): string | null {
  const candidate =
    (payload.updated_at as string | undefined) ??
    (payload.updatedAt as string | undefined) ??
    (payload.deleted_at as string | undefined) ??
    (payload.deletedAt as string | undefined) ??
    null;
  return typeof candidate === 'string' ? candidate : null;
}

function parseVersion(payload: Record<string, unknown>): number | null {
  const v = payload.version;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const parsed = Number(v);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function fetchLocalRow(
  config: TableConfig,
  id: string,
): { updated_at?: string; version?: number } | null {
  const columns: string[] = [];
  if (config.columns.includes('updated_at')) {
    columns.push('updated_at');
  }
  if (config.hasVersion) {
    columns.push('version');
  }
  if (columns.length === 0) return null;

  const row = query<{ updated_at?: string; version?: number }>(
    `SELECT ${columns.join(', ')} FROM ${config.tableName} WHERE ${config.primaryKey} = ? LIMIT 1;`,
    [id],
  )[0];
  return row ?? null;
}

function isNewerTimestamp(localValue?: string | null, incomingValue?: string | null): boolean {
  const localTime = parseTimestampMs(localValue);
  const incomingTime = parseTimestampMs(incomingValue);
  if (localTime === null || incomingTime === null) return false;
  return localTime > incomingTime;
}

function shouldSkipDelta(
  config: TableConfig,
  localRow: { updated_at?: string; version?: number } | null,
  payload: Record<string, unknown>,
): boolean {
  if (!localRow) return false;

  const incomingVersion = parseVersion(payload);
  const incomingUpdatedAt = parseUpdatedAt(payload);

  if (config.hasVersion && incomingVersion !== null && localRow.version !== undefined) {
    if (localRow.version > incomingVersion) return true;
    if (localRow.version === incomingVersion) {
      return isNewerTimestamp(localRow.updated_at, incomingUpdatedAt);
    }
  }

  if (incomingUpdatedAt) {
    return isNewerTimestamp(localRow.updated_at, incomingUpdatedAt);
  }

  return false;
}

function upsertRow(config: TableConfig, payload: Record<string, unknown>) {
  const columns = config.columns;
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => toSqlValue(payload[column]));
  const updateColumns = columns.filter((column) => column !== config.primaryKey);
  const updateAssignments = updateColumns
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  exec(
    `
    INSERT INTO ${config.tableName} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(${config.primaryKey}) DO UPDATE SET
      ${updateAssignments};
  `,
    values,
  );
}

function toSqlValue(value: unknown): SQLite.SQLiteBindValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function applyDelete(config: TableConfig, payload: Record<string, unknown>) {
  const id = String(payload[config.primaryKey]);
  const incomingDeletedAt =
    (payload.deleted_at as string | undefined) ?? (payload.deletedAt as string | undefined) ?? null;
  const incomingUpdatedAt = parseUpdatedAt(payload);

  if (config.hasDeletedAt) {
    if (incomingUpdatedAt) {
      exec(
        `
        UPDATE ${config.tableName}
        SET deleted_at = COALESCE(?, deleted_at),
            updated_at = COALESCE(?, updated_at)
        WHERE ${config.primaryKey} = ?;
      `,
        [incomingDeletedAt, incomingUpdatedAt, id],
      );
    } else {
      exec(
        `
        UPDATE ${config.tableName}
        SET deleted_at = COALESCE(?, deleted_at),
            updated_at = datetime('now')
        WHERE ${config.primaryKey} = ?;
      `,
        [incomingDeletedAt, id],
      );
    }
    return;
  }

  exec(`DELETE FROM ${config.tableName} WHERE ${config.primaryKey} = ?;`, [id]);
}

function isForeignKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().includes('foreign key');
}

function normalizeWorkoutSessionStatus(status: unknown): string {
  return typeof status === 'string' ? status.toLowerCase() : '';
}

function getExistingInProgressSessionId(): string | null {
  const row = query<{ id: string }>(
    "SELECT id FROM workout_session WHERE lower(status) = 'in_progress' LIMIT 1;",
  )[0];
  return row?.id ?? null;
}

function shouldSkipInProgressConflict(delta: SyncDelta, payload: Record<string, unknown>): boolean {
  if (delta.entityType !== 'workout_session') return false;
  if (delta.opType.toLowerCase() !== 'upsert') return false;
  if (normalizeWorkoutSessionStatus(payload.status) !== 'in_progress') return false;

  const localInProgressId = getExistingInProgressSessionId();
  if (!localInProgressId) return false;

  const incomingId = String(payload.id ?? delta.entityId);
  if (localInProgressId === incomingId) return false;

  logEvent('warn', 'sync', 'sync_delta_skipped_in_progress_conflict', {
    localInProgressId,
    incomingId,
    incomingUpdatedAt: parseUpdatedAt(payload),
  });
  return true;
}

function applyDelta(delta: SyncDelta): DeltaOutcome {
  const config = tableConfigs[delta.entityType];
  if (!config) {
    logEvent('warn', 'sync', 'Skipped delta with unknown entity type', {
      entityType: delta.entityType,
      entityId: delta.entityId,
      changeId: delta.changeId ?? null,
    });
    return 'skipped';
  }

  const payload = normalizePayload(delta.payload, delta.entityId, config);
  if (shouldSkipInProgressConflict(delta, payload)) {
    return 'skipped';
  }

  const localRow = fetchLocalRow(config, String(payload[config.primaryKey]));

  if (shouldSkipDelta(config, localRow, payload)) {
    logEvent('warn', 'sync', 'Skipped delta due to newer local row', {
      entityType: delta.entityType,
      entityId: delta.entityId,
      opType: delta.opType,
    });
    return 'skipped';
  }

  const opType = delta.opType.toLowerCase();
  if (opType === 'delete') {
    const incomingDeletedAt =
      (payload.deleted_at as string | undefined) ??
      (payload.deletedAt as string | undefined) ??
      null;
    if (!incomingDeletedAt) {
      logEvent('warn', 'sync', 'Skipped delete delta without deleted_at', {
        entityType: delta.entityType,
        entityId: delta.entityId,
        changeId: delta.changeId ?? null,
      });
      return 'skipped';
    }
    applyDelete(config, payload);
    return 'applied';
  }

  if (opType !== 'upsert') {
    throw new Error(`Unsupported delta opType: ${delta.opType}`);
  }

  upsertRow(config, payload);
  return 'applied';
}

export function applyDeltas(deltas: SyncDelta[]): {
  applied: number;
  skipped: number;
  total: number;
} {
  const total = deltas.length;
  if (total === 0) return { applied: 0, skipped: 0, total: 0 };

  const sorted = [...deltas].sort((a, b) => {
    const aOrder = tableConfigs[a.entityType]?.order ?? 9999;
    const bOrder = tableConfigs[b.entityType]?.order ?? 9999;
    return aOrder - bOrder;
  });

  let applied = 0;
  let skipped = 0;
  let pending = sorted;
  let pass = 0;

  while (pending.length > 0) {
    pass += 1;
    const deferred: SyncDelta[] = [];

    for (const delta of pending) {
      try {
        const outcome = applyDelta(delta);
        if (outcome === 'applied') {
          applied += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        if (isForeignKeyError(err)) {
          deferred.push(delta);
          continue;
        }
        throw err;
      }
    }

    if (deferred.length === 0) {
      break;
    }

    if (deferred.length === pending.length) {
      const details = deferred.map((delta) => `${delta.entityType}:${delta.entityId}`).join(', ');
      throw new Error(`Unable to apply deltas due to missing parents: ${details}`);
    }

    pending = deferred;

    if (pass > 5) {
      throw new Error('Unable to apply deltas after multiple dependency retries.');
    }
  }

  logEvent('info', 'sync', 'Applied sync deltas', { applied, skipped, total });

  return { applied, skipped, total };
}
