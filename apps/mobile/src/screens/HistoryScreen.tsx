import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui';
import { AppText } from '../components/AppText';
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

  const confirmDeleteOne = useCallback(
    (s: CompletedSessionRow) => {
      Alert.alert('Delete workout?', 'This will remove the workout from your history.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSession(s.id);
            load();
          },
        },
      ]);
    },
    [load],
  );

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      'Delete all history?',
      'This will remove all completed workouts from your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            deleteAllCompletedSessions();
            load();
          },
        },
      ],
    );
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
            <Ionicons name="trash-outline" size={18} color={tokens.colors.textSecondary} />
            <AppText color="textSecondary">Delete all</AppText>
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
            <AppText variant="subtitle">
              This week: {formatVolume(thisWeek.total_kg)} kg ({thisWeek.workouts} workouts)
            </AppText>

            {weeklyExercises.length > 0 ? (
              <View style={{ gap: tokens.spacing.xs }}>
                <AppText color="textSecondary">Top exercises</AppText>
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
                      <AppText color="textSecondary">{x.exercise_name}</AppText>
                    </View>
                    <AppText color="textSecondary">{formatVolume(x.total_kg)} kg</AppText>
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
            <AppText variant="subtitle">Weekly volume</AppText>

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
                  <AppText>{formatWeekLabel(w.week_start)}</AppText>
                  <AppText color="textSecondary">{w.sessions} workouts</AppText>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <AppText>{formatVolume(w.volume)} kg</AppText>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {sessions.length === 0 ? (
          <AppText color="textSecondary">No completed workouts yet.</AppText>
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
                <AppText variant="subtitle">{item.title}</AppText>
                <AppText color="textSecondary">
                  {formatDateTime(item.ended_at ?? item.started_at)}
                </AppText>
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
                <Ionicons name="trash-outline" size={20} color={tokens.colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
