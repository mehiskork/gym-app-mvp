import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { tokens } from '../../theme/tokens';
import { safeJsonParse } from '../../utils/json';
import {
  getInProgressWorkout,
  getTableCounts,
  getSyncDebugInfo,
  clearOutboxForDebug,
  repairStaleInFlightOpsForDebug,
  resetInProgressWorkoutHardDelete,
  resetSyncCursorForDebug,
  repairSessionsMissingSets,
  testNestedTransactionRollback,
  validateStatusEnums,
  verifySyncState,
  getWorkoutSessionExerciseSchemaHealth,
  getWeekStartDebugInfo,
  getSupportBundle,
} from '../../db/debugRepo';
import { listSyncRuns } from '../../db/syncRunRepo';

import { seedTestPlan } from '../../db/seed/seedTestPlan';
import { query } from '../../db/db';
import appConfig from '../../../app.json';
import { getApiBaseUrl } from '../../api/config';
import { registerDeviceIfNeeded, syncNow } from '../../sync/syncWorker';
import { OUTBOX_STALE_IN_FLIGHT_SECONDS } from '../../sync/constants';

function Card({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  const isDanger = tone === 'danger';
  return (
    <View
      style={{
        backgroundColor: isDanger ? '#3b1111' : tokens.colors.surface,
        borderColor: isDanger ? '#7f1d1d' : tokens.colors.border,
        borderWidth: 1,
        borderRadius: tokens.radius.lg,
        padding: tokens.spacing.lg,
        marginBottom: tokens.spacing.lg,
      }}
    >
      <Text variant="subtitle" style={{ marginBottom: tokens.spacing.md }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function CollapsibleSection({
  title,
  defaultExpanded,
  children,
  tone = 'default',
}: {
  title: string;
  defaultExpanded: boolean;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card title="" tone={tone}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: expanded ? tokens.spacing.md : 0,
        }}
      >
        <Text variant="subtitle">{title}</Text>
        <Text variant="muted">{expanded ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expanded ? children : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: tokens.spacing.md,
        marginBottom: 8,
      }}
    >
      <Text variant="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function CopyableRow({
  label,
  value,
  displayValue,
}: {
  label: string;
  value: string | null | undefined;
  displayValue?: string;
}) {
  const renderedValue = displayValue ?? value ?? '—';
  const copy = async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  return (
    <Pressable onPress={copy} disabled={!value} style={{ opacity: value ? 1 : 0.7 }}>
      <Row label={label} value={renderedValue} />
    </Pressable>
  );
}

function StackedRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text variant="muted">{label}</Text>
      <Text style={{ fontWeight: '600', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function CopyableInlineValue({
  prefix,
  value,
  copyValue,
  marginBottom = 8,
}: {
  prefix: string;
  value: string;
  copyValue?: string;
  marginBottom?: number;
}) {
  const copy = async () => {
    const text = copyValue ?? value;
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${prefix} copied to clipboard.`);
  };

  return (
    <Pressable onPress={copy} style={{ marginBottom }}>
      <Text style={{ fontWeight: '600' }}>
        <Text variant="muted">{prefix}</Text>
        {` · ${value}`}
      </Text>
    </Pressable>
  );
}

function truncate(value: string | null | undefined, max = 120): string {
  if (!value) return '—';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function truncateId(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function getUrlHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function DebugScreen() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [inProgress, setInProgress] = useState<ReturnType<typeof getInProgressWorkout>>(null);
  const [syncInfo, setSyncInfo] = useState<ReturnType<typeof getSyncDebugInfo> | null>(null);
  const [syncStateHealth, setSyncStateHealth] = useState<ReturnType<typeof verifySyncState> | null>(
    null,
  );
  const [wseSchemaHealth, setWseSchemaHealth] = useState<ReturnType<
    typeof getWorkoutSessionExerciseSchemaHealth
  > | null>(null);
  const [weekStartDebug, setWeekStartDebug] = useState<ReturnType<
    typeof getWeekStartDebugInfo
  > | null>(null);
  const [syncRuns, setSyncRuns] = useState<ReturnType<typeof listSyncRuns>>([]);

  const refresh = useCallback(() => {
    const c = getTableCounts();
    const ip = getInProgressWorkout();
    const info = getSyncDebugInfo();
    const runs = listSyncRuns(10);
    setCounts(c);
    setInProgress(ip);
    setSyncInfo(info);
    setSyncRuns(runs);
    if (__DEV__) {
      setSyncStateHealth(verifySyncState());
      setWseSchemaHealth(getWorkoutSessionExerciseSchemaHealth());
      setWeekStartDebug(getWeekStartDebugInfo());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => { };
    }, [refresh]),
  );

  const expoConfig = appConfig.expo as {
    name?: string;
    version?: string;
    ios?: { buildNumber?: string };
    android?: { versionCode?: number };
  };

  const buildNumber =
    expoConfig?.ios?.buildNumber ?? expoConfig?.android?.versionCode?.toString() ?? '0';

  const buildInfo = {
    appName: expoConfig?.name ?? 'Unknown',
    version: expoConfig?.version ?? '0.0.0',
    build: buildNumber,
    jsEngine: (global as { HermesInternal?: unknown }).HermesInternal ? 'hermes' : 'jsc',
    updatesEnabled: Updates.isEnabled,
    updateId: Updates.updateId ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    channel: (Updates as { channel?: string | null }).channel ?? null,
    isDev: __DEV__,
  };

  const exportLogs = useCallback(async () => {
    const logs = query<{
      id: number;
      at: number;
      level: string;
      tag: string;
      message: string;
      context_json: string | null;
    }>(`SELECT id, at, level, tag, message, context_json FROM app_log ORDER BY at DESC LIMIT 1000`);

    const payload = {
      exportedAt: new Date().toISOString(),
      buildInfo,
      counts,
      inProgress,
      logs: logs.map((l) => ({
        ...l,
        context: l.context_json ? safeJsonParse(l.context_json) : null,
        context_json: undefined,
      })),
    };

    const json = JSON.stringify(payload, null, 2);

    try {
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (baseDir) {
        const path = `${baseDir}gym-debug-${Date.now()}.json`;
        await FileSystem.writeAsStringAsync(path, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'application/json' });
          return;
        }
      }
    } catch {
      // fall through to clipboard
    }

    await Clipboard.setStringAsync(json);
    Alert.alert('Copied', 'Debug JSON copied to clipboard.');
  }, [buildInfo, counts, inProgress]);

  const exportSupportBundle = useCallback(async () => {
    const bundle = getSupportBundle();
    const json = JSON.stringify(bundle, null, 2);

    const timestamp = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const fileName = `gymapp_support_${timestamp.getFullYear()}${pad(
      timestamp.getMonth() + 1,
    )}${pad(timestamp.getDate())}_${pad(timestamp.getHours())}${pad(
      timestamp.getMinutes(),
    )}${pad(timestamp.getSeconds())}.json`;

    const copyToClipboard = async () => {
      await Clipboard.setStringAsync(json);
      Alert.alert('Copied', 'Support bundle JSON copied to clipboard.');
    };

    try {
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (baseDir) {
        const path = `${baseDir}${fileName}`;
        await FileSystem.writeAsStringAsync(path, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'application/json' });
          return;
        }

        Alert.alert('Sharing unavailable', 'Support bundle saved locally.', [
          { text: 'Copy to clipboard', onPress: copyToClipboard },
          { text: 'OK' },
        ]);
        return;
      }
    } catch {
      // fall through to clipboard
    }

    await copyToClipboard();
  }, []);

  const devOnly = __DEV__;
  const baseUrl = getApiBaseUrl();
  const backendHost = getUrlHost(baseUrl);

  const overview = useMemo(() => {
    if (!syncInfo) {
      return {
        syncHealth: 'loading',
        lastSyncResult: '—',
      };
    }

    const accountBlocked =
      syncInfo.authDebug.linkedState === 'linked' &&
      syncInfo.authDebug.accountSessionStatus !== 'usable';

    const hasError = Boolean(syncInfo.syncState.last_error);
    const hasPendingChanges =
      syncInfo.outboxStatusCounts.pending > 0 ||
      syncInfo.outboxStatusCounts.failed > 0 ||
      syncInfo.outboxStatusCounts.in_flight > 0;

    let syncHealth = 'healthy';
    if (hasError) {
      syncHealth = 'error';
    } else if (accountBlocked) {
      syncHealth = 'auth blocked';
    } else if (hasPendingChanges) {
      syncHealth = 'pending changes';
    }

    const latestRun = syncRuns[0];
    const lastSyncResult = hasError
      ? 'Error'
      : latestRun?.status
        ? toTitleCase(latestRun.status)
        : syncInfo.syncState.last_sync_at
          ? 'Success'
          : 'Never synced';

    return {
      syncHealth,
      lastSyncResult,
    };
  }, [syncInfo, syncRuns]);

  const copyConciseDiagnostics = useCallback(async () => {
    if (!syncInfo) {
      Alert.alert('Unavailable', 'Diagnostics are still loading.');
      return;
    }

    const summary = [
      `Backend host: ${backendHost}`,
      `Linked state: ${syncInfo.authDebug.linkedState}`,
      `Device token present: ${syncInfo.authDebug.deviceTokenPresent ? 'yes' : 'no'}`,
      `Account session: ${syncInfo.authDebug.accountSessionStatus}`,
      `Auth mode last/next: ${syncInfo.authDebug.syncAuthModeLastUsed ?? '—'} / ${syncInfo.authDebug.syncAuthModeNextPlanned ?? '—'}`,
      `Pending ops: ${syncInfo.pendingOpsCount}`,
      `Cursor: ${syncInfo.syncState.cursor ?? '—'}`,
      `Last sync result: ${overview.lastSyncResult}`,
      `Last error: ${truncate(syncInfo.syncState.last_error, 100)}`,
    ].join('\n');

    await Clipboard.setStringAsync(summary);
    Alert.alert('Copied', 'Concise diagnostics copied to clipboard.');
  }, [backendHost, overview.lastSyncResult, syncInfo]);

  const localStorageRows = useMemo(() => {
    return Object.entries(counts).sort((a, b) => {
      const [aKey, aValue] = a;
      const [bKey, bValue] = b;
      if (aValue === 0 && bValue !== 0) return 1;
      if (aValue !== 0 && bValue === 0) return -1;
      return aKey.localeCompare(bKey);
    });
  }, [counts]);

  const destructiveConfirm = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'destructive', onPress: onConfirm },
    ]);
  };

  return (
    <Screen padded bottomInset="none" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.xl }}>
        <Card title="Overview">
          {syncInfo ? (
            <>
              <Row label="Sync health" value={overview.syncHealth} />
              <CopyableInlineValue prefix="Backend" value={backendHost} copyValue={baseUrl} />
              <Row label="Linked state" value={toTitleCase(syncInfo.authDebug.linkedState)} />
              <Row
                label="Device token"
                value={syncInfo.authDebug.deviceTokenPresent ? 'Present' : 'Missing'}
              />
              <Row
                label="Account session"
                value={toTitleCase(syncInfo.authDebug.accountSessionStatus)}
              />
              <Row
                label="Auth mode (last / next)"
                value={`${syncInfo.authDebug.syncAuthModeLastUsed ?? '—'} / ${syncInfo.authDebug.syncAuthModeNextPlanned ?? '—'}`}
              />
              <Row label="Pending ops" value={String(syncInfo.pendingOpsCount)} />
              <CopyableRow
                label="Cursor"
                value={syncInfo.syncState.cursor}
                displayValue={truncate(syncInfo.syncState.cursor, 30)}
              />
              <Row label="Last sync result" value={overview.lastSyncResult} />
              {syncInfo.syncState.last_sync_at ? (
                <Row label="Last sync time" value={formatDate(syncInfo.syncState.last_sync_at)} />
              ) : null}
              {syncInfo.syncState.last_error ? (
                <Row label="Last error" value={truncate(syncInfo.syncState.last_error, 80)} />
              ) : null}
            </>
          ) : (
            <Text variant="muted">Loading…</Text>
          )}
        </Card>

        <CollapsibleSection title="Identity & Auth" defaultExpanded>
          {syncInfo ? (
            <>
              <CopyableRow
                label="Guest user ID"
                value={syncInfo.guestUserId}
                displayValue={truncateId(syncInfo.guestUserId)}
              />
              <CopyableRow
                label="Effective user ID"
                value={syncInfo.effectiveUserId}
                displayValue={truncateId(syncInfo.effectiveUserId)}
              />
              <CopyableRow
                label="Device ID"
                value={syncInfo.deviceId}
                displayValue={truncateId(syncInfo.deviceId)}
              />
              <Row label="Linked state" value={toTitleCase(syncInfo.authDebug.linkedState)} />
              <Row
                label="Account session status"
                value={toTitleCase(syncInfo.authDebug.accountSessionStatus)}
              />
              {syncInfo.authDebug.accountInvalidationReason ? (
                <Row
                  label="Account invalidation reason"
                  value={syncInfo.authDebug.accountInvalidationReason}
                />
              ) : null}
              {syncInfo.authDebug.accountInvalidatedAt ? (
                <Row
                  label="Account invalidated at"
                  value={formatDate(syncInfo.authDebug.accountInvalidatedAt)}
                />
              ) : null}
              <Row
                label="Device token present"
                value={syncInfo.authDebug.deviceTokenPresent ? 'Yes' : 'No'}
              />
              {syncInfo.authDebug.syncAuthModeLastUsed ? (
                <Row label="Auth mode last used" value={syncInfo.authDebug.syncAuthModeLastUsed} />
              ) : null}
              {syncInfo.authDebug.syncAuthModeNextPlanned ? (
                <Row
                  label="Auth mode next planned"
                  value={syncInfo.authDebug.syncAuthModeNextPlanned}
                />
              ) : null}
            </>
          ) : (
            <Text variant="muted">Loading…</Text>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Sync & Queue" defaultExpanded>
          {syncInfo ? (
            <>
              <Row label="Sync status" value={overview.syncHealth} />
              <Row label="Pending ops" value={String(syncInfo.pendingOpsCount)} />
              <Row
                label="Outbox history total"
                value={String(syncInfo.outboxHistoryTotalCount)}
              />
              <StackedRow
                label="Outbox by status"
                value={`pending ${syncInfo.outboxStatusCounts.pending} • failed ${syncInfo.outboxStatusCounts.failed} • in-flight ${syncInfo.outboxStatusCounts.in_flight} • acked ${syncInfo.outboxStatusCounts.acked}`}
              />
              <Row label="Due now" value={String(syncInfo.dueNowCount)} />
              <CopyableRow
                label="Cursor"
                value={syncInfo.syncState.cursor}
                displayValue={truncate(syncInfo.syncState.cursor, 48)}
              />
              <Row label="Last sync result" value={overview.lastSyncResult} />
              <Row label="Last sync time" value={formatDate(syncInfo.syncState.last_sync_at)} />
              {syncInfo.syncState.last_error ? (
                <Row label="Last error" value={truncate(syncInfo.syncState.last_error)} />
              ) : null}
              <Row
                label="Last delta count"
                value={String(syncInfo.syncState.last_delta_count ?? 0)}
              />
              <Row
                label="Last ack summary"
                value={
                  syncInfo.lastSyncAckSummary
                    ? `applied ${syncInfo.lastSyncAckSummary.applied} • noop ${syncInfo.lastSyncAckSummary.noop} • rejected ${syncInfo.lastSyncAckSummary.rejected}`
                    : '—'
                }
              />

              <Text variant="subtitle" style={{ marginTop: tokens.spacing.md }}>
                Recent sync runs
              </Text>
              {syncRuns.length === 0 ? (
                <Text variant="muted">No sync runs yet.</Text>
              ) : (
                syncRuns.slice(0, 5).map((run) => (
                  <View key={run.id} style={{ marginBottom: tokens.spacing.sm }}>
                    <Text style={{ fontWeight: '600' }}>
                      {`${new Date(run.started_at).toLocaleString()} • ${toTitleCase(run.status)}`}
                    </Text>
                    <Text variant="muted">{`ops ${run.ops_sent} • deltas ${run.deltas_applied}`}</Text>
                    <Text variant="muted">
                      {`cursor ${run.cursor_before ?? '—'} → ${run.cursor_after ?? '—'}`}
                    </Text>
                    <Text variant="muted">{`error ${run.error_code ?? '—'}`}</Text>
                  </View>
                ))
              )}

              <Text variant="subtitle" style={{ marginTop: tokens.spacing.md }}>
                Recent outbox ops
              </Text>
              {syncInfo.recentOutboxOps.length === 0 ? (
                <Text variant="muted">No outbox ops yet.</Text>
              ) : (
                syncInfo.recentOutboxOps.map((op) => (
                  <View key={op.op_id} style={{ marginTop: tokens.spacing.sm }}>
                    <Text style={{ fontWeight: '600' }}>{truncate(op.op_id, 36)}</Text>
                    <Text variant="muted">
                      {`${op.status} • attempts ${op.attempt_count} • next ${op.next_attempt_at ?? '—'}`}
                    </Text>
                    <Text variant="muted">
                      {`created ${op.created_at} • error ${truncate(op.last_error, 80)}`}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : (
            <Text variant="muted">Loading…</Text>
          )}

          <Text variant="subtitle" style={{ marginTop: tokens.spacing.md }}>
            Operations
          </Text>
          <Pressable
            onPress={async () => {
              await syncNow({ force: true });
              refresh();
            }}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Sync now</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              await syncNow({ force: true, pullOnly: true });
              refresh();
            }}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Pull latest</Text>
          </Pressable>

          <Text variant="subtitle" style={{ marginTop: tokens.spacing.lg }}>
            Repair / Dev actions
          </Text>
          <Pressable
            onPress={() => {
              const repaired = repairStaleInFlightOpsForDebug(OUTBOX_STALE_IN_FLIGHT_SECONDS);
              refresh();
              Alert.alert('Repair complete', `Returned ${repaired} op(s) to failed.`);
            }}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Repair stale in-flight</Text>
          </Pressable>
        </CollapsibleSection>

        <CollapsibleSection title="Support" defaultExpanded>
          <Pressable
            onPress={exportSupportBundle}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Export support bundle</Text>
          </Pressable>

          <Pressable
            onPress={copyConciseDiagnostics}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Copy concise diagnostics</Text>
          </Pressable>

          <Text variant="muted" style={{ marginTop: tokens.spacing.md }}>
            Share support bundle for full diagnostics, or use concise diagnostics for quick tester
            updates.
          </Text>
        </CollapsibleSection>

        <CollapsibleSection title="Backend / Environment" defaultExpanded={false}>
          <CopyableInlineValue
            prefix="Backend URL"
            value={baseUrl}
            copyValue={baseUrl}
            marginBottom={tokens.spacing.sm}
          />
          <Row label="App" value={buildInfo.appName} />
          <Row label="Version" value={`${buildInfo.version} (${buildInfo.build})`} />
          <Row label="JS engine" value={buildInfo.jsEngine} />
          <Row label="Dev mode" value={buildInfo.isDev ? 'true' : 'false'} />
          <Row label="Updates enabled" value={buildInfo.updatesEnabled ? 'true' : 'false'} />
          <Row label="Update ID" value={buildInfo.updateId ?? '—'} />
          <Row label="Runtime version" value={buildInfo.runtimeVersion ?? '—'} />
          <Row label="Channel" value={buildInfo.channel ?? '—'} />
        </CollapsibleSection>

        <CollapsibleSection title="Local Storage" defaultExpanded={false}>
          <Text variant="subtitle" style={{ marginBottom: tokens.spacing.sm }}>
            Database table counts
          </Text>
          {Object.keys(counts).length === 0 ? (
            <Text variant="muted">Loading…</Text>
          ) : (
            localStorageRows.map(([k, v]) => (
              <View key={k} style={{ opacity: v === 0 ? 0.65 : 1 }}>
                <Row label={k} value={String(v)} />
              </View>
            ))
          )}
          <Pressable
            onPress={refresh}
            style={{
              marginTop: tokens.spacing.md,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Refresh counts</Text>
          </Pressable>

          <Text variant="subtitle" style={{ marginTop: tokens.spacing.lg }}>
            In-progress workout
          </Text>
          {inProgress ? (
            <>
              <CopyableRow
                label="Session ID"
                value={String(inProgress.sessionId)}
                displayValue={truncateId(String(inProgress.sessionId))}
              />
              <Row label="Sets" value={String(inProgress.setCount)} />
              <Row
                label="Started"
                value={inProgress.startedAt ? new Date(inProgress.startedAt).toLocaleString() : '—'}
              />
            </>
          ) : (
            <Text variant="muted">None</Text>
          )}

          {devOnly && weekStartDebug ? (
            <>
              <Text variant="subtitle" style={{ marginTop: tokens.spacing.lg }}>
                Week start debug
              </Text>
              <Row label="Week start (now)" value={weekStartDebug.weekStartNow || '—'} />
              {weekStartDebug.recentWeekBuckets.length === 0 ? (
                <Text variant="muted">No completed sessions.</Text>
              ) : (
                weekStartDebug.recentWeekBuckets.map((bucket) => (
                  <Row
                    key={bucket.week_start}
                    label={bucket.week_start}
                    value={`${bucket.sessions} sessions`}
                  />
                ))
              )}
            </>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Developer Tools" defaultExpanded={false}>
          <Pressable
            disabled={!devOnly}
            onPress={() => {
              const result = validateStatusEnums();
              Alert.alert(result.ok ? 'Success' : 'Failure', result.message);
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Validate status enums (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              const result = testNestedTransactionRollback();
              Alert.alert(result.ok ? 'Success' : 'Failure', result.message);
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Test nested transaction rollback (dev-only)</Text>
          </Pressable>

          {devOnly && syncStateHealth ? (
            <>
              <Row label="Sync state schema" value={syncStateHealth.ok ? 'ok' : 'issue'} />
              {!syncStateHealth.ok ? <Text variant="muted">{syncStateHealth.message}</Text> : null}
            </>
          ) : null}
          {devOnly && wseSchemaHealth ? (
            <>
              <Row label="Cardio schema" value={wseSchemaHealth.ok ? 'ok' : 'issue'} />
              {!wseSchemaHealth.ok ? <Text variant="muted">{wseSchemaHealth.message}</Text> : null}
            </>
          ) : null}

          <Pressable
            onPress={exportLogs}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Export logs (JSON)</Text>
          </Pressable>
        </CollapsibleSection>

        <CollapsibleSection
          title="Destructive / Dev-only Actions"
          defaultExpanded={false}
          tone="danger"
        >
          <Text variant="muted" style={{ marginBottom: tokens.spacing.md }}>
            These actions are risky and intended only for development troubleshooting.
          </Text>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Force register device',
                'This mutates local/device auth state. Continue?',
                () => {
                  void registerDeviceIfNeeded().then(() => {
                    refresh();
                    Alert.alert('Done', 'Device registration attempted.');
                  });
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Force register device (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Reset cursor',
                'This resets the sync cursor to 0 and forces re-download. Continue?',
                () => {
                  resetSyncCursorForDebug();
                  refresh();
                  Alert.alert('Done', 'Sync cursor reset to 0.');
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Reset cursor to 0 (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Clear outbox',
                'This deletes outbox ops and resets sync state. Continue?',
                () => {
                  clearOutboxForDebug();
                  refresh();
                  Alert.alert('Done', 'Outbox cleared.');
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Clear outbox (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Reset in-progress workout',
                'This hard-deletes the active workout session. Continue?',
                () => {
                  resetInProgressWorkoutHardDelete();
                  refresh();
                  Alert.alert('Done', 'In-progress workout cleared.');
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Reset in-progress workout (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Repair sessions missing sets',
                'This mutates historical data by inserting missing sets. Continue?',
                () => {
                  const repaired = repairSessionsMissingSets();
                  refresh();
                  Alert.alert('Done', `Inserted ${repaired} missing set(s).`);
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Repair sessions missing sets (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              destructiveConfirm(
                'Seed test plan',
                'This writes development seed data. Continue?',
                () => {
                  seedTestPlan();
                  refresh();
                  Alert.alert('Done', 'Test plan seeded (if not already present).');
                },
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: '#7f1d1d',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Seed test plan (dev-only)</Text>
          </Pressable>
        </CollapsibleSection>
      </ScrollView>
    </Screen>
  );
}
