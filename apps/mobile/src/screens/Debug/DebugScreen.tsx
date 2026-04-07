import React, { useCallback, useState } from 'react';
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: tokens.colors.surface,
        borderColor: tokens.colors.border,
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
      <Text style={{ fontWeight: '600' }}>{value}</Text>
    </View>
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

function truncate(value: string | null | undefined, max = 120): string {
  if (!value) return '—';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
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

  return (
    <Screen padded bottomInset="none" style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.xl }}>
        <Card title="Build">
          <Row label="App" value={buildInfo.appName} />
          <Row label="Version" value={`${buildInfo.version} (${buildInfo.build})`} />
          <Row label="JS Engine" value={buildInfo.jsEngine} />
          <Row label="Dev mode" value={buildInfo.isDev ? 'true' : 'false'} />
          <Row label="Updates enabled" value={buildInfo.updatesEnabled ? 'true' : 'false'} />
          <Row label="Update ID" value={buildInfo.updateId ?? '—'} />
          <Row label="Runtime" value={buildInfo.runtimeVersion ?? '—'} />
          <Row label="Channel" value={buildInfo.channel ?? '—'} />
        </Card>

        {devOnly && syncInfo ? (
          <Card title="Sync identity">
            <StackedRow label="Guest user id" value={syncInfo.guestUserId ?? '—'} />
            <StackedRow label="Effective user id" value={syncInfo.effectiveUserId} />
          </Card>
        ) : null}

        <Card title="Database counts">
          {Object.keys(counts).length === 0 ? (
            <Text variant="muted">Loading…</Text>
          ) : (
            Object.entries(counts).map(([k, v]) => <Row key={k} label={k} value={String(v)} />)
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
            <Text style={{ fontWeight: '700' }}>Refresh</Text>
          </Pressable>
        </Card>

        {devOnly && weekStartDebug ? (
          <Card title="Week start debug">
            <StackedRow label="Week start (now)" value={weekStartDebug.weekStartNow || '—'} />
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
          </Card>
        ) : null}

        <Card title="In-progress workout">
          {inProgress ? (
            <>
              <Row label="Session ID" value={String(inProgress.sessionId)} />
              <Row label="Sets" value={String(inProgress.setCount)} />
              <Row
                label="Started"
                value={inProgress.startedAt ? new Date(inProgress.startedAt).toLocaleString() : '—'}
              />
            </>
          ) : (
            <Text variant="muted">None</Text>
          )}

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              Alert.alert(
                'Reset in-progress workout',
                'This is destructive and intended for development only. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => {
                      resetInProgressWorkoutHardDelete();
                      refresh();
                      Alert.alert('Done', 'In-progress workout cleared.');
                    },
                  },
                ],
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              marginTop: tokens.spacing.md,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Reset in-progress workout (dev-only)</Text>
          </Pressable>
        </Card>

        <Card title="Utilities">
          <Pressable
            disabled={!devOnly}
            onPress={() => {
              const repaired = repairSessionsMissingSets();
              refresh();
              Alert.alert('Done', `Inserted ${repaired} missing set(s).`);
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
            <Text style={{ fontWeight: '700' }}>Repair sessions missing sets (dev-only)</Text>
          </Pressable>
          <Pressable
            disabled={!devOnly}
            onPress={() => {
              seedTestPlan();
              refresh();
              Alert.alert('Done', 'Test plan seeded (if not already present).');
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
            <Text style={{ fontWeight: '700' }}>Seed test plan (dev-only)</Text>
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
            onPress={exportLogs}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Export logs (JSON)</Text>
          </Pressable>

          <Text variant="muted" style={{ marginTop: tokens.spacing.md }}>
            Export includes build info, DB counts, in-progress workout, and last 1000 log entries.
          </Text>
        </Card>

        <Card title="Support">
          <Pressable
            onPress={exportSupportBundle}
            style={{
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontWeight: '700' }}>Export support bundle</Text>
          </Pressable>
          <Text variant="muted" style={{ marginTop: tokens.spacing.md }}>
            Export includes auth/session status, sync state, outbox stats, recent sync runs, and table counts.
          </Text>
        </Card>

        <Card title="Sync">
          {syncInfo ? (
            <>
              <Row label="API Base URL" value={baseUrl} />
              {devOnly && syncStateHealth ? (
                <Row label="Sync state schema" value={syncStateHealth.ok ? 'ok' : 'issue'} />
              ) : null}
              {devOnly && wseSchemaHealth ? (
                <Row label="Cardio schema" value={wseSchemaHealth.ok ? 'ok' : 'issue'} />
              ) : null}
              {devOnly && syncStateHealth && !syncStateHealth.ok ? (
                <Text variant="muted">{syncStateHealth.message}</Text>
              ) : null}
              {devOnly && wseSchemaHealth && !wseSchemaHealth.ok ? (
                <Text variant="muted">{wseSchemaHealth.message}</Text>
              ) : null}
              <Row label="Device ID" value={syncInfo.deviceId} />
              <Row label="Sync auth mode (last)" value={syncInfo.authDebug.syncAuthModeLastUsed ?? '—'} />
              <Row
                label="Sync auth mode (next)"
                value={syncInfo.authDebug.syncAuthModeNextPlanned ?? '—'}
              />
              <Row label="Account session status" value={syncInfo.authDebug.accountSessionStatus} />
              <Row
                label="Account invalidation reason"
                value={syncInfo.authDebug.accountInvalidationReason ?? '—'}
              />
              <Row label="Account invalidated at" value={syncInfo.authDebug.accountInvalidatedAt ?? '—'} />
              <Row
                label="Device token present"
                value={syncInfo.authDebug.deviceTokenPresent ? 'true' : 'false'}
              />
              <Row label="Linked state" value={syncInfo.authDebug.linkedState} />
              <StackedRow label="Guest user ID" value={syncInfo.guestUserId ?? '—'} />
              <Row label="Outbox total" value={String(syncInfo.outboxTotalCount)} />
              <StackedRow
                label="By status"
                value={`pending ${syncInfo.outboxStatusCounts.pending} • failed ${syncInfo.outboxStatusCounts.failed} • in_flight ${syncInfo.outboxStatusCounts.in_flight} • acked ${syncInfo.outboxStatusCounts.acked}`}
              />
              <Row label="Due now" value={String(syncInfo.dueNowCount)} />
              <Row label="Cursor" value={syncInfo.syncState.cursor ?? '—'} />
              <Row label="Last sync" value={syncInfo.syncState.last_sync_at ?? '—'} />
              <Row label="Last error" value={truncate(syncInfo.syncState.last_error)} />
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
                Recent ops
              </Text>
              {syncInfo.recentOutboxOps.length === 0 ? (
                <Text variant="muted">No outbox ops yet.</Text>
              ) : (
                syncInfo.recentOutboxOps.map((op) => (
                  <View key={op.op_id} style={{ marginTop: tokens.spacing.sm }}>
                    <Text style={{ fontWeight: '600' }}>{op.op_id}</Text>
                    <Text variant="muted">
                      {`${op.status} • attempts ${op.attempt_count} • next ${op.next_attempt_at ?? '—'
                        }`}
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

          <Pressable
            disabled={!devOnly}
            onPress={async () => {
              await registerDeviceIfNeeded();
              refresh();
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              marginTop: tokens.spacing.md,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginBottom: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Register device (dev-only)</Text>
          </Pressable>

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
            <Text style={{ fontWeight: '700' }}>Pull only</Text>
          </Pressable>

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

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              Alert.alert(
                'Reset cursor',
                'This will reset the sync cursor to 0 and re-download deltas. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => {
                      resetSyncCursorForDebug();
                      refresh();
                      Alert.alert('Done', 'Sync cursor reset to 0.');
                    },
                  },
                ],
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Reset cursor to 0 (dev-only)</Text>
          </Pressable>

          <Pressable
            disabled={!devOnly}
            onPress={() => {
              Alert.alert(
                'Clear outbox',
                'This will delete all outbox ops and reset sync state. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      clearOutboxForDebug();
                      refresh();
                      Alert.alert('Done', 'Outbox cleared.');
                    },
                  },
                ],
              );
            }}
            style={{
              opacity: devOnly ? 1 : 0.4,
              paddingVertical: tokens.spacing.md,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              alignItems: 'center',
              marginTop: tokens.spacing.md,
            }}
          >
            <Text style={{ fontWeight: '700' }}>Clear outbox (dev-only)</Text>
          </Pressable>
        </Card>
        <Card title="Sync Runs">
          {syncRuns.length === 0 ? (
            <Text variant="muted">No sync runs yet.</Text>
          ) : (
            syncRuns.map((run) => (
              <View key={run.id} style={{ marginBottom: tokens.spacing.md }}>
                <Text style={{ fontWeight: '600' }}>
                  {`${new Date(run.started_at).toLocaleString()} • ${run.status}`}
                </Text>
                <Text variant="muted">{`ops ${run.ops_sent} • deltas ${run.deltas_applied}`}</Text>
                <Text variant="muted">
                  {`cursor ${run.cursor_before ?? '—'} → ${run.cursor_after ?? '—'}`}
                </Text>
                <Text variant="muted">{`error ${run.error_code ?? '—'}`}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
