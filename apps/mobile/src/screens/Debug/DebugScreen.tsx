import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

import { Screen } from '../../components/Screen';
import { AppText } from '../../components/AppText';
import { tokens } from '../../theme/tokens';
import {
  getInProgressWorkout,
  getTableCounts,
  resetInProgressWorkoutHardDelete,
  repairSessionsMissingSets,
} from '../../db/debugRepo';
import { seedTestPlan } from '../../db/seed/seedTestPlan';
import { query } from '../../db/db';
import appConfig from '../../../app.json';

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
      <AppText variant="subtitle" style={{ marginBottom: tokens.spacing.md }}>
        {title}
      </AppText>
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
      <AppText color="textSecondary" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText style={{ fontWeight: '600' }}>{value}</AppText>
    </View>
  );
}

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { _parseError: true, raw: s };
  }
}

export function DebugScreen() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [inProgress, setInProgress] = useState<ReturnType<typeof getInProgressWorkout>>(null);

  const refresh = useCallback(() => {
    const c = getTableCounts();
    const ip = getInProgressWorkout();
    setCounts(c);
    setInProgress(ip);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {};
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

  const devOnly = __DEV__;

  return (
    <Screen padded style={{ flex: 1 }}>
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

        <Card title="Database counts">
          {Object.keys(counts).length === 0 ? (
            <AppText color="textSecondary">Loading…</AppText>
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
            <AppText style={{ fontWeight: '700' }}>Refresh</AppText>
          </Pressable>
        </Card>

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
            <AppText color="textSecondary">None</AppText>
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
            <AppText style={{ fontWeight: '700' }}>Reset in-progress workout (dev-only)</AppText>
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
            <AppText style={{ fontWeight: '700' }}>Repair sessions missing sets (dev-only)</AppText>
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
            <AppText style={{ fontWeight: '700' }}>Seed test plan (dev-only)</AppText>
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
            <AppText style={{ fontWeight: '700' }}>Export logs (JSON)</AppText>
          </Pressable>

          <AppText color="textSecondary" style={{ marginTop: tokens.spacing.md }}>
            Export includes build info, DB counts, in-progress workout, and last 1000 log entries.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}
