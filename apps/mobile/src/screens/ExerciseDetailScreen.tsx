import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { tokens } from '../theme/tokens';
import {
  getExerciseById,
  listExerciseSessionsWithSets,
  type SessionWithSets,
} from '../db/exerciseDetailRepo';
import {
  durationSeconds,
  formatDateTime,
  formatDurationSeconds,
  formatKg,
} from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;



function formatSetLine(weight: number | null, reps: number | null) {
  const w = weight ?? 0;
  const r = reps ?? 0;
  return `${formatKg(w)} × ${r}`;
}

function epleyE1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

function isValidSet(weight: number | null, reps: number | null) {
  return (
    typeof weight === 'number' &&
    Number.isFinite(weight) &&
    weight > 0 &&
    typeof reps === 'number' &&
    Number.isFinite(reps) &&
    reps > 0
  );
}

function computeVolume(sets: { weight: number | null; reps: number | null }[]) {
  return sets.reduce((sum, s) => {
    if (!isValidSet(s.weight, s.reps)) return sum;
    return sum + (s.weight as number) * (s.reps as number);
  }, 0);
}

export function ExerciseDetailScreen({ route, navigation }: Props) {
  const { exerciseId } = route.params;

  const [name, setName] = useState<string>('Exercise');
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);

  const load = useCallback(() => {
    const ex = getExerciseById(exerciseId);
    setName(ex?.name ?? 'Exercise');

    const s = listExerciseSessionsWithSets(exerciseId, 5);
    setSessions(s);
  }, [exerciseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: name });
    }, [navigation, name]),
  );

  const last = sessions[0] ?? null;
  const recent = sessions.slice(1);

  const lastDuration = useMemo(() => {
    if (!last) return '';
    return formatDurationSeconds(durationSeconds(last.started_at, last.ended_at));
  }, [last]);

  const metrics = useMemo(() => {
    if (sessions.length === 0) return null;

    // Flatten sets with session timestamp for display
    const all = sessions.flatMap((sess) =>
      sess.sets.map((s) => ({
        ...s,
        when: sess.ended_at ?? sess.started_at,
      })),
    );

    // Prefer completed sets; if none completed, fall back to all sets
    const completedValid = all.filter((s) => s.is_completed === 1 && isValidSet(s.weight, s.reps));
    const anyValid = all.filter((s) => isValidSet(s.weight, s.reps));
    const pool = completedValid.length > 0 ? completedValid : anyValid;

    if (pool.length === 0) return null;

    // Best e1RM set
    let best = pool[0];
    let bestE1 = epleyE1RM(best.weight as number, best.reps as number);

    for (const s of pool) {
      const e1 = epleyE1RM(s.weight as number, s.reps as number);
      if (e1 > bestE1) {
        best = s;
        bestE1 = e1;
      }
    }

    // Per-session volume (prefer completed sets; fall back if none completed)
    const volumes = sessions.map((sess) => {
      const completed = sess.sets.filter((x) => x.is_completed === 1);
      const vol = computeVolume(completed.length > 0 ? completed : sess.sets);
      return {
        session_id: sess.session_id,
        when: sess.ended_at ?? sess.started_at,
        volume: vol,
      };
    });

    const lastVol = volumes[0]?.volume ?? 0;
    const last5 = volumes.slice(0, 5).map((v) => v.volume);

    return {
      bestWeight: best.weight as number,
      bestReps: best.reps as number,
      bestWhen: best.when,
      bestE1RM: bestE1,
      lastVolume: lastVol,
      last5Volumes: last5,
    };
  }, [sessions]);

  return (
    <Screen bottomInset="none" style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
      >
        <View style={{ gap: tokens.spacing.xs }}>
          <Text variant="muted">Exercise</Text>
          <Text variant="title">{name}</Text>
        </View>

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
          <Text variant="subtitle">Progression</Text>

          {!metrics ? (
            <Text variant="muted">Log some sets to see progression.</Text>
          ) : (
            <View style={{ gap: tokens.spacing.sm }}>
              <View style={{ gap: tokens.spacing.xs }}>
                <Text variant="muted">Best set (by e1RM)</Text>
                <Text>
                  {formatKg(metrics.bestWeight) + ' kg'} × {metrics.bestReps} ·{' '}
                  <Text variant="muted">{formatDateTime(metrics.bestWhen)}</Text>
                </Text>
              </View>

              <View style={{ gap: tokens.spacing.xs }}>
                <Text variant="muted">Best estimated 1RM (Epley)</Text>
                <Text>{formatKg(metrics.bestE1RM)} kg</Text>
              </View>

              <View style={{ gap: tokens.spacing.xs }}>
                <Text variant="muted">Last workout volume</Text>
                <Text>{Math.round(metrics.lastVolume)} kg</Text>
              </View>

              <View style={{ gap: tokens.spacing.xs }}>
                <Text variant="muted">Last 5 volumes</Text>
                <Text variant="muted">
                  {metrics.last5Volumes.map((v) => Math.round(v)).join(' • ')}
                </Text>
              </View>
            </View>
          )}
        </View>

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
          <Text variant="subtitle">Last workout</Text>

          {!last ? (
            <Text variant="muted">No history yet for this exercise.</Text>
          ) : (
            <>
              <Text variant="muted">
                {formatDateTime(last.ended_at ?? last.started_at)}
              </Text>
              {lastDuration ? (
                <Text variant="muted">Duration: {lastDuration}</Text>
              ) : null}

              <View style={{ gap: tokens.spacing.xs }}>
                {last.sets.length === 0 ? (
                  <Text variant="muted">No sets logged.</Text>
                ) : (
                  last.sets.map((s) => (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingVertical: tokens.spacing.xs,
                        borderTopWidth: 1,
                        borderTopColor: tokens.colors.border,
                      }}
                    >
                      <Text variant="muted">Set {s.set_index}</Text>
                      <Text>{formatSetLine(s.weight, s.reps)}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </View>

        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="subtitle">Recent sessions</Text>

          {recent.length === 0 ? (
            <Text variant="muted">No earlier sessions.</Text>
          ) : (
            recent.map((sess) => (
              <Pressable
                key={sess.session_id}
                onPress={() => navigation.navigate('SessionDetail', { sessionId: sess.session_id })}
                style={({ pressed }) => [
                  {
                    padding: tokens.spacing.md,
                    backgroundColor: tokens.colors.surface,
                    borderRadius: tokens.radius.md,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                    gap: tokens.spacing.xs,
                  },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel={`Open session ${sess.title}`}
              >
                <Text variant="subtitle">{sess.title}</Text>
                <Text variant="muted">
                  {formatDateTime(sess.ended_at ?? sess.started_at)}
                </Text>

                {sess.sets.length > 0 ? (
                  <Text variant="muted">
                    {sess.sets
                      .slice(0, 3)
                      .map((s) => formatSetLine(s.weight, s.reps))
                      .join('  •  ')}
                    {sess.sets.length > 3 ? '  •  …' : ''}
                  </Text>
                ) : (
                  <Text variant="muted">No sets logged.</Text>
                )}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
