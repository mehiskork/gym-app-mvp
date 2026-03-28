import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { tokens } from '../theme/tokens';
import { listSessionPrEvents, recomputeSessionPrsIfNeeded, type PrEventRow } from '../db/prRepo';
import {
  durationSeconds,
  formatDateTime,
  formatDurationSeconds,
  formatNumber,
} from '../utils/format';
import {
  getSessionDetail,
  type SessionExerciseRow,
  type SessionSetRow,
  type CompletedSessionRow,
} from '../db/historyRepo';
import { EXERCISE_TYPE } from '../db/exerciseTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionDetail'>;



function formatPr(e: PrEventRow): string {
  if (e.pr_type === 'weight') return `Weight PR: ${formatNumber(e.value)} kg`;
  if (e.pr_type === 'volume') return `Volume PR: ${Math.round(e.value)} kg·reps`;

  // reps_at_weight: context like "w:60.00"
  if (e.pr_type === 'reps_at_weight') {
    const w = e.context.startsWith('w:') ? Number(e.context.slice(2)) : NaN;
    const wText = Number.isFinite(w) ? `${formatNumber(w)} kg` : 'that weight';
    return `Reps PR: ${Math.round(e.value)} reps @ ${wText}`;
  }

  return `PR: ${e.pr_type} ${e.value}`;
}

export function SessionDetailScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<CompletedSessionRow | null>(null);
  const [exercises, setExercises] = useState<SessionExerciseRow[]>([]);
  const [sets, setSets] = useState<SessionSetRow[]>([]);
  const [prs, setPrs] = useState<PrEventRow[]>([]);

  const load = useCallback(() => {
    const data = getSessionDetail(sessionId);
    if (!data) {
      setSession(null);
      setExercises([]);
      setSets([]);
      setPrs([]);
      return;
    }
    setSession(data.session);
    setExercises(data.exercises);
    setSets(data.sets);
    recomputeSessionPrsIfNeeded(sessionId);
    setPrs(listSessionPrEvents(sessionId));
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (session?.title) navigation.setOptions({ title: session.title });
    }, [navigation, session?.title]),
  );

  const setsByWse = useMemo(() => {
    const map = new Map<string, SessionSetRow[]>();
    for (const s of sets) {
      const arr = map.get(s.workout_session_exercise_id) ?? [];
      arr.push(s);
      map.set(s.workout_session_exercise_id, arr);
    }
    return map;
  }, [sets]);

  if (!session) {
    return (
      <Screen bottomInset="none" style={{ justifyContent: 'center' }}>
        <Text variant="title">Session not found</Text>
        <Text variant="muted">This workout session no longer exists.</Text>
      </Screen>
    );
  }

  const dur = formatDurationSeconds(durationSeconds(session.started_at, session.ended_at));
  const formatCardio = (ex: SessionExerciseRow) => {
    const fields: string[] = [];
    if (ex.cardio_duration_minutes !== null) fields.push(`Duration ${ex.cardio_duration_minutes} min`);
    if (ex.cardio_distance_km !== null) fields.push(`Distance ${ex.cardio_distance_km} km`);
    if (ex.cardio_speed_kph !== null) fields.push(`Speed ${ex.cardio_speed_kph} km/h`);
    if (ex.cardio_incline_percent !== null) fields.push(`Incline ${ex.cardio_incline_percent}%`);
    if (ex.cardio_resistance_level !== null) fields.push(`Resistance ${ex.cardio_resistance_level}`);
    if (ex.cardio_pace_seconds_per_km !== null) fields.push(`Pace ${ex.cardio_pace_seconds_per_km}s/km`);
    if (ex.cardio_floors !== null) fields.push(`Floors ${ex.cardio_floors}`);
    if (ex.cardio_stair_level !== null) fields.push(`Level ${ex.cardio_stair_level}`);
    return fields;
  };

  return (
    <Screen bottomInset="none" style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: tokens.spacing.xs }}>
          {prs.length > 0 ? (
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
              <Text variant="subtitle">PRs</Text>
              {prs.map((p) => (
                <Text key={p.id}>{formatPr(p)}</Text>
              ))}
            </View>
          ) : null}


          <Text variant="muted">{formatDateTime(session.started_at)}</Text>
          {dur ? <Text variant="muted">Duration: {dur}</Text> : null}
          {session.workout_note?.trim() ? (
            <Text variant="muted">Workout note: {session.workout_note.trim()}</Text>
          ) : null}
        </View>

        {exercises.map((ex) => {
          const exSets = setsByWse.get(ex.id) ?? [];
          return (
            <View
              key={ex.id}
              style={{
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                gap: tokens.spacing.sm,
              }}
            >
              <Pressable
                onPress={() =>
                  navigation.navigate('ExerciseDetail', { exerciseId: ex.exercise_id })
                }
                style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                accessibilityLabel={`Open exercise details for ${ex.exercise_name}`}
              >
                <Text variant="subtitle">{ex.exercise_name}</Text>
              </Pressable>
              {ex.notes?.trim() ? <Text variant="muted">Comment: {ex.notes.trim()}</Text> : null}

              {ex.exercise_type === EXERCISE_TYPE.CARDIO ? (
                formatCardio(ex).length === 0 ? (
                  <Text variant="muted">No cardio summary logged.</Text>
                ) : (
                  formatCardio(ex).map((line) => <Text key={line} variant="muted">{line}</Text>)
                )
              ) : exSets.length === 0 ? (
                <Text variant="muted">No sets logged.</Text>
              ) : (
                exSets.map((s) => (
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
                    <Text>
                      {(s.weight ?? 0).toString()} × {(s.reps ?? 0).toString()}
                      {s.is_completed === 1 ? '' : ' (edit)'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
