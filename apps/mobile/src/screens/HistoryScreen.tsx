import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { DestructiveConfirmDialog, Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { formatDateTime, formatVolume, formatWeekLabel } from '../utils/format';

import {
  deleteAllCompletedSessions,
  deleteSession,
  listCompletedSessions,
  type CompletedSessionRow,
} from '../db/historyRepo';

import { listWeeklyVolume, type WeeklyVolumeRow } from '../db/metricsRepo';
import {
  getThisWeekSummary,
  listThisWeekExerciseTotals,
  type WeeklyExerciseRow,
} from '../db/weeklyRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HistoryScreen() {
  const navigation = useNavigation<Nav>();

  const [sessions, setSessions] = useState<CompletedSessionRow[]>([]);
  const [weekly, setWeekly] = useState<WeeklyVolumeRow[]>([]);
  const [thisWeek, setThisWeek] = useState<ReturnType<typeof getThisWeekSummary> | null>(null);
  const [weeklyExercises, setWeeklyExercises] = useState<WeeklyExerciseRow[]>([]);

  const [deleteSessionTarget, setDeleteSessionTarget] = useState<CompletedSessionRow | null>(null);
  const [deleteAllVisible, setDeleteAllVisible] = useState(false);

  const load = useCallback(() => {
    setSessions(listCompletedSessions(50));
    setWeekly(listWeeklyVolume(8));

    const w = getThisWeekSummary();
    setThisWeek(w);
    setWeeklyExercises(listThisWeekExerciseTotals(6));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canDeleteAll = sessions.length > 0;

  const confirmDeleteOne = useCallback((s: CompletedSessionRow) => {
    setDeleteSessionTarget(s);
  }, []);

  const confirmDeleteAll = useCallback(() => {
    setDeleteAllVisible(true);
  }, []);

  const handleConfirmDeleteOne = useCallback(() => {
    if (!deleteSessionTarget) return;
    deleteSession(deleteSessionTarget.id);
    setDeleteSessionTarget(null);
    load();
  }, [deleteSessionTarget, load]);

  const handleConfirmDeleteAll = useCallback(() => {
    deleteAllCompletedSessions();
    setDeleteAllVisible(false);
    load();
  }, [load]);

  const header = useMemo(
    () => (
      <View style={{ gap: tokens.spacing.md }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            onPress={confirmDeleteAll}
            disabled={!canDeleteAll}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                opacity: canDeleteAll ? 1 : 0.4,
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.sm,
                borderRadius: tokens.radius.sm,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              },
              pressed && canDeleteAll ? { opacity: 0.85 } : null,
            ]}
            accessibilityLabel="Delete all history"
          >
            <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
            <Text color={tokens.colors.destructive}>Delete all</Text>
          </Pressable>
        </View>

        {thisWeek ? (
          <View
            style={{
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              gap: tokens.spacing.sm,
            }}
          >
            <Text variant="subtitle">
              This week: {formatVolume(thisWeek.total_kg)} kg ({thisWeek.workouts} workouts)
            </Text>

            {weeklyExercises.length > 0 ? (
              <View style={{ gap: tokens.spacing.xs }}>
                <Text color={tokens.colors.textSecondary}>Top exercises</Text>
                {weeklyExercises.map((x) => (
                  <View
                    key={x.exercise_id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: tokens.spacing.md,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text color={tokens.colors.textSecondary}>{x.exercise_name}</Text>
                    </View>
                    <Text color={tokens.colors.textSecondary}>{formatVolume(x.total_kg)} kg</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {weekly.length > 0 ? (
          <View
            style={{
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
              gap: tokens.spacing.sm,
            }}
          >
            <Text variant="subtitle">Weekly volume</Text>

            {weekly.map((w) => (
              <View
                key={w.week_start}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: tokens.spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text>{formatWeekLabel(w.week_start)}</Text>
                  <Text color={tokens.colors.textSecondary}>{w.sessions} workouts</Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text>{formatVolume(w.volume)} kg</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {sessions.length === 0 ? (
          <Text color={tokens.colors.textSecondary}>No completed workouts yet.</Text>
        ) : null}
      </View>
    ),
    [canDeleteAll, confirmDeleteAll, sessions.length, weekly, thisWeek, weeklyExercises],
  );

  return (
    <Screen
      scroll
      padded={false}
      bottomInset="tabBar"
      contentStyle={{
        gap: tokens.spacing.md,
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: tokens.spacing.lg,
      }}
    >
      {header}

      {sessions.length > 0 ? (
        <View style={{ gap: tokens.spacing.md }}>
          {sessions.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              }}
            >
              <Pressable
                onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
                style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.85 } : null]}
              >
                <Text variant="subtitle">{item.title}</Text>
                <Text color={tokens.colors.textSecondary}>
                  {formatDateTime(item.ended_at ?? item.started_at)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => confirmDeleteOne(item)}
                style={({ pressed }) => [
                  {
                    minHeight: tokens.touchTargetMin,
                    minWidth: tokens.touchTargetMin,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.sm,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                  },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="Delete workout from history"
              >
                <Ionicons name="trash-outline" size={20} color={tokens.colors.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <DestructiveConfirmDialog
        visible={deleteSessionTarget !== null}
        title="Delete workout?"
        body="This will remove the workout from your history."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeleteSessionTarget(null)}
        onConfirm={handleConfirmDeleteOne}
      />
      <DestructiveConfirmDialog
        visible={deleteAllVisible}
        title="Delete all history?"
        body="This will remove all completed workouts from your history."
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        onClose={() => setDeleteAllVisible(false)}
        onConfirm={handleConfirmDeleteAll}
      />
    </Screen>
  );
}
