import type * as SQLite from 'expo-sqlite';
import { exec, query } from '../db/db';
import { hasActiveOutboxOpForEntity } from '../db/outboxRepo';
import { logEvent } from '../utils/logger';
import { parseTimestampMs } from '../utils/timestamp';
import { ACTIVE_WORKOUT_ENTITY_TYPES } from './activeWorkoutEntities';

export type SyncDelta = {
  entityType: string;
  entityId: string;
  opType: string;
  payload: unknown;
  changeId?: number;
};

export type SyncApplyContext = {
  cursorBefore?: string | null;
  responseCursor?: string | null;
  protectedEntityKeys?: Iterable<string>;
};

export type SyncApplyFailureDiagnostic = {
  capturedAt: string;
  errorMessage: string;
  cursorBefore: string | null;
  responseCursor: string | null;
  deltaIndex: number | null;
  changeId: number | null;
  entityType: string;
  entityId: string;
  opType: string;
  tableName: string | null;
  orderedParent: {
    parentField: string;
    parentId: string;
    orderField: string;
    orderValue: number | string | null;
  } | null;
  orderedPayload: Record<string, string | number | null>;
  localSiblings: Array<Record<string, string | number | null>>;
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
  exercise_favorite: {
    tableName: 'exercise_favorite',
    primaryKey: 'id',
    columns: [
      'id',
      'exercise_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'version',
      'last_modified_by_device_id',
    ],
    hasDeletedAt: true,
    hasVersion: true,
    order: 45,
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
      'planned_cardio_duration_minutes',
      'planned_cardio_distance_km',
      'planned_cardio_speed_kph',
      'planned_cardio_incline_percent',
      'planned_cardio_resistance_level',
      'planned_cardio_pace_seconds_per_km',
      'planned_cardio_floors',
      'planned_cardio_stair_level',
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
      'plan_note_snapshot',
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
};

export function getSyncApplyEntityTypes(): string[] {
  return Object.entries(tableConfigs)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([entityType]) => entityType);
}

type DeltaOutcome = 'applied' | 'skipped';

const SYNC_APPLY_FAILURE_DIAGNOSTIC_KEY = 'latest_sync_apply_failure_diagnostic_v1';
const SYNC_APPLY_FAILURE_DIAGNOSTIC_SYMBOL = Symbol('syncApplyFailureDiagnostic');

type ErrorWithSyncApplyFailureDiagnostic = Error & {
  [SYNC_APPLY_FAILURE_DIAGNOSTIC_SYMBOL]?: SyncApplyFailureDiagnostic;
};

type OrderedEntityConfig = {
  parentField: string;
  orderField: string;
};

const orderedEntityConfigs: Partial<Record<string, OrderedEntityConfig>> = {
  program_week: {
    parentField: 'program_id',
    orderField: 'week_index',
  },
  program_day: {
    parentField: 'program_week_id',
    orderField: 'day_index',
  },
  program_day_exercise: {
    parentField: 'program_day_id',
    orderField: 'position',
  },
  planned_set: {
    parentField: 'program_day_exercise_id',
    orderField: 'set_index',
  },
  workout_session_exercise: {
    parentField: 'workout_session_id',
    orderField: 'position',
  },
  workout_set: {
    parentField: 'workout_session_exercise_id',
    orderField: 'set_index',
  },
};

function normalizeDiagnosticValue(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'Unknown sync apply error');
}

function readLocalSiblings(
  tableName: string,
  parentField: string,
  orderField: string,
  parentId: string,
): Array<Record<string, string | number | null>> {
  try {
    return query<Record<string, string | number | null>>(
      `
      SELECT
        id,
        ${parentField},
        ${orderField},
        deleted_at,
        updated_at
      FROM ${tableName}
      WHERE ${parentField} = ?
      ORDER BY ${orderField} ASC, id ASC;
    `,
      [parentId],
    ).map((row) => ({
      id: normalizeDiagnosticValue(row.id),
      [parentField]: normalizeDiagnosticValue(row[parentField]),
      [orderField]: normalizeDiagnosticValue(row[orderField]),
      deleted_at: normalizeDiagnosticValue(row.deleted_at),
      updated_at: normalizeDiagnosticValue(row.updated_at),
    }));
  } catch {
    return [];
  }
}

function buildSyncApplyFailureDiagnostic(input: {
  err: unknown;
  delta: SyncDelta;
  deltaIndex: number | null;
  context?: SyncApplyContext;
}): SyncApplyFailureDiagnostic {
  const config = tableConfigs[input.delta.entityType];
  const payload = config
    ? normalizePayload(input.delta.payload, input.delta.entityId, config)
    : input.delta.payload && typeof input.delta.payload === 'object'
      ? { ...(input.delta.payload as Record<string, unknown>) }
      : {};
  const orderedConfig = orderedEntityConfigs[input.delta.entityType];
  const parentIdValue = orderedConfig ? payload[orderedConfig.parentField] : null;
  const orderValue = orderedConfig
    ? normalizeDiagnosticValue(payload[orderedConfig.orderField])
    : null;
  const parentId =
    typeof parentIdValue === 'string' || typeof parentIdValue === 'number'
      ? String(parentIdValue)
      : null;

  const orderedPayload: Record<string, string | number | null> = {
    id: normalizeDiagnosticValue(payload[config?.primaryKey ?? 'id'] ?? input.delta.entityId),
  };
  if (orderedConfig) {
    orderedPayload[orderedConfig.parentField] = normalizeDiagnosticValue(parentIdValue);
    orderedPayload[orderedConfig.orderField] = orderValue;
  }

  return {
    capturedAt: new Date().toISOString(),
    errorMessage: getErrorMessage(input.err),
    cursorBefore: input.context?.cursorBefore ?? null,
    responseCursor: input.context?.responseCursor ?? null,
    deltaIndex: input.deltaIndex,
    changeId: input.delta.changeId ?? null,
    entityType: input.delta.entityType,
    entityId: input.delta.entityId,
    opType: input.delta.opType,
    tableName: config?.tableName ?? null,
    orderedParent:
      orderedConfig && parentId
        ? {
            parentField: orderedConfig.parentField,
            parentId,
            orderField: orderedConfig.orderField,
            orderValue,
          }
        : null,
    orderedPayload,
    localSiblings:
      orderedConfig && parentId && config
        ? readLocalSiblings(
            config.tableName,
            orderedConfig.parentField,
            orderedConfig.orderField,
            parentId,
          )
        : [],
  };
}

function attachSyncApplyFailureDiagnostic(
  err: unknown,
  diagnostic: SyncApplyFailureDiagnostic,
): void {
  if (err instanceof Error) {
    (err as ErrorWithSyncApplyFailureDiagnostic)[SYNC_APPLY_FAILURE_DIAGNOSTIC_SYMBOL] = diagnostic;
  }
}

export function getSyncApplyFailureDiagnosticFromError(
  err: unknown,
): SyncApplyFailureDiagnostic | null {
  if (!(err instanceof Error)) return null;
  return (err as ErrorWithSyncApplyFailureDiagnostic)[SYNC_APPLY_FAILURE_DIAGNOSTIC_SYMBOL] ?? null;
}

export function persistSyncApplyFailureDiagnostic(
  diagnostic: SyncApplyFailureDiagnostic | null,
): void {
  if (!diagnostic) return;
  try {
    exec(
      `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now');
    `,
      [SYNC_APPLY_FAILURE_DIAGNOSTIC_KEY, JSON.stringify(diagnostic)],
    );
  } catch {
    // Diagnostics must never change sync behavior.
  }
}

export function readLatestSyncApplyFailureDiagnostic(): SyncApplyFailureDiagnostic | null {
  try {
    const row = query<{ value: string }>(
      `
      SELECT value
      FROM app_meta
      WHERE key = ?
      LIMIT 1;
    `,
      [SYNC_APPLY_FAILURE_DIAGNOSTIC_KEY],
    )[0];
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as SyncApplyFailureDiagnostic;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

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

function getDeletedAt(payload: Record<string, unknown>): string | null {
  const deletedAt =
    (payload.deleted_at as string | undefined) ?? (payload.deletedAt as string | undefined) ?? null;
  return typeof deletedAt === 'string' && deletedAt.length > 0 ? deletedAt : null;
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

function isSameOrNewerTimestamp(
  localValue?: string | null,
  incomingValue?: string | null,
): boolean {
  const localTime = parseTimestampMs(localValue);
  const incomingTime = parseTimestampMs(incomingValue);
  if (localTime === null || incomingTime === null) return false;
  return localTime >= incomingTime;
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

function entityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function hasExplicitActiveWorkoutLocalWrite(input: {
  entityType: string;
  entityId: string;
  protectedEntityKeys: Set<string>;
}): boolean {
  const key = entityKey(input.entityType, input.entityId);
  if (input.protectedEntityKeys.has(key)) return true;
  return hasActiveOutboxOpForEntity(input.entityType, input.entityId);
}

function shouldSkipActiveWorkoutLocalWriteDelta(input: {
  delta: SyncDelta;
  payload: Record<string, unknown>;
  localRow: { updated_at?: string; version?: number } | null;
  protectedEntityKeys: Set<string>;
}): boolean {
  if (!ACTIVE_WORKOUT_ENTITY_TYPES.has(input.delta.entityType)) return false;
  if (input.delta.opType.toLowerCase() !== 'upsert') return false;

  const id = String(input.payload.id ?? input.delta.entityId);
  if (
    hasExplicitActiveWorkoutLocalWrite({
      entityType: input.delta.entityType,
      entityId: id,
      protectedEntityKeys: input.protectedEntityKeys,
    })
  ) {
    return true;
  }

  // Active workout rows are non-versioned and commonly use SQLite datetime('now')
  // second precision. Equal timestamps should keep the local offline-first row
  // instead of allowing a stale server snapshot to clear recent workout edits.
  return isSameOrNewerTimestamp(input.localRow?.updated_at, parseUpdatedAt(input.payload));
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
  const incomingDeletedAt = getDeletedAt(payload);
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
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.toLowerCase().includes('foreign key');
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

type OrderedDeltaStagingCandidate = {
  delta: SyncDelta;
  config: TableConfig;
  orderedConfig: OrderedEntityConfig;
  payload: Record<string, unknown>;
  id: string;
  parentId: string;
};

function toOrderedDeltaStagingCandidate(
  delta: SyncDelta,
  protectedEntityKeys: Set<string>,
): OrderedDeltaStagingCandidate | null {
  const config = tableConfigs[delta.entityType];
  const orderedConfig = orderedEntityConfigs[delta.entityType];
  if (!config || !orderedConfig) return null;

  const payload = normalizePayload(delta.payload, delta.entityId, config);
  if (delta.opType.toLowerCase() !== 'upsert' || getDeletedAt(payload)) return null;

  const id = String(payload[config.primaryKey]);
  const parentValue = payload[orderedConfig.parentField];
  if (parentValue === undefined || parentValue === null) return null;
  const parentId = String(parentValue);
  if (parentId.length === 0) return null;

  const orderValue = payload[orderedConfig.orderField];
  if (typeof orderValue !== 'number' || !Number.isFinite(orderValue)) return null;

  if (shouldSkipInProgressConflict(delta, payload)) return null;

  const localRow = fetchLocalRow(config, id);
  if (!localRow) return null;

  if (shouldSkipActiveWorkoutLocalWriteDelta({ delta, payload, localRow, protectedEntityKeys })) {
    return null;
  }

  if (shouldSkipDelta(config, localRow, payload)) return null;

  return { delta, config, orderedConfig, payload, id, parentId };
}

function stageOrderedDeltaGroup(candidates: OrderedDeltaStagingCandidate[]): void {
  if (candidates.length < 2) return;

  const { config, orderedConfig, parentId } = candidates[0];
  const ids = candidates.map((candidate) => candidate.id);
  const placeholders = ids.map(() => '?').join(', ');
  const existingRows = query<{ id: string }>(
    `
    SELECT ${config.primaryKey} AS id
    FROM ${config.tableName}
    WHERE ${orderedConfig.parentField} = ?
      AND ${config.primaryKey} IN (${placeholders});
  `,
    [parentId, ...ids],
  );
  const existingIds = new Set(existingRows.map((row) => String(row.id)));

  candidates.forEach((candidate, index) => {
    if (!existingIds.has(candidate.id)) return;
    exec(
      `
      UPDATE ${candidate.config.tableName}
      SET ${candidate.orderedConfig.orderField} = ?
      WHERE ${candidate.config.primaryKey} = ?
        AND ${candidate.orderedConfig.parentField} = ?;
    `,
      [-1_000_000_000 - index, candidate.id, candidate.parentId],
    );
  });
}

function stageOrderedDeltas(deltas: SyncDelta[], protectedEntityKeys: Set<string>): void {
  const groups = new Map<string, OrderedDeltaStagingCandidate[]>();

  for (const delta of deltas) {
    const candidate = toOrderedDeltaStagingCandidate(delta, protectedEntityKeys);
    if (!candidate) continue;
    const key = `${candidate.delta.entityType}:${candidate.parentId}`;
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  for (const group of groups.values()) {
    stageOrderedDeltaGroup(group);
  }
}

function applyDelta(delta: SyncDelta, protectedEntityKeys: Set<string>): DeltaOutcome {
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
  const opType = delta.opType.toLowerCase();
  const incomingDeletedAt = getDeletedAt(payload);
  if (incomingDeletedAt) {
    const id = String(payload[config.primaryKey]);
    if (
      ACTIVE_WORKOUT_ENTITY_TYPES.has(delta.entityType) &&
      hasExplicitActiveWorkoutLocalWrite({
        entityType: delta.entityType,
        entityId: id,
        protectedEntityKeys,
      })
    ) {
      // Active local workout writes must not be deleted by a stale or racing
      // server tombstone while the local operation is pending or just sent.
      // Non-workout entities keep the existing authoritative tombstone behavior.
      logEvent('warn', 'sync', 'Skipped active workout tombstone due to protected local write', {
        entityType: delta.entityType,
        entityId: delta.entityId,
        opType: delta.opType,
      });
      return 'skipped';
    }

    applyDelete(config, payload);
    return 'applied';
  }

  if (opType === 'delete') {
    logEvent('warn', 'sync', 'Skipped delete delta without deleted_at', {
      entityType: delta.entityType,
      entityId: delta.entityId,
      changeId: delta.changeId ?? null,
    });
    return 'skipped';
  }

  if (shouldSkipInProgressConflict(delta, payload)) {
    return 'skipped';
  }

  const localRow = fetchLocalRow(config, String(payload[config.primaryKey]));

  if (shouldSkipActiveWorkoutLocalWriteDelta({ delta, payload, localRow, protectedEntityKeys })) {
    logEvent('warn', 'sync', 'Skipped active workout delta due to protected local write', {
      entityType: delta.entityType,
      entityId: delta.entityId,
      opType: delta.opType,
    });
    return 'skipped';
  }

  if (shouldSkipDelta(config, localRow, payload)) {
    logEvent('warn', 'sync', 'Skipped delta due to newer local row', {
      entityType: delta.entityType,
      entityId: delta.entityId,
      opType: delta.opType,
    });
    return 'skipped';
  }

  if (opType !== 'upsert') {
    throw new Error(`Unsupported delta opType: ${delta.opType}`);
  }

  upsertRow(config, payload);
  return 'applied';
}

export function applyDeltas(
  deltas: SyncDelta[],
  context: SyncApplyContext = {},
): {
  applied: number;
  skipped: number;
  total: number;
} {
  const total = deltas.length;
  if (total === 0) return { applied: 0, skipped: 0, total: 0 };
  const protectedEntityKeys = new Set(context.protectedEntityKeys ?? []);
  const responseIndexByDelta = new Map<SyncDelta, number>();
  deltas.forEach((delta, index) => {
    responseIndexByDelta.set(delta, index);
  });

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
    stageOrderedDeltas(pending, protectedEntityKeys);

    for (const delta of pending) {
      try {
        const outcome = applyDelta(delta, protectedEntityKeys);
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
        attachSyncApplyFailureDiagnostic(
          err,
          buildSyncApplyFailureDiagnostic({
            err,
            delta,
            deltaIndex: responseIndexByDelta.get(delta) ?? null,
            context,
          }),
        );
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
