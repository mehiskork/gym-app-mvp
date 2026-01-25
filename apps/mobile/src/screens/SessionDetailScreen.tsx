import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
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
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Session not found</AppText>
        <AppText color="textSecondary">This workout session no longer exists.</AppText>
      </Screen>
    );
  }

  const dur = formatDurationSeconds(durationSeconds(session.started_at, session.ended_at));

  return (
    <Screen style={{ flex: 1 }}>
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
              <AppText variant="subtitle">PRs</AppText>
              {prs.map((p) => (
                <AppText key={p.id}>{formatPr(p)}</AppText>
              ))}
            </View>
          ) : null}

          <AppText variant="title">{session.title}</AppText>
          <AppText color="textSecondary">{formatDateTime(session.started_at)}</AppText>
          {dur ? <AppText color="textSecondary">Duration: {dur}</AppText> : null}
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
                <AppText variant="subtitle">{ex.exercise_name}</AppText>
              </Pressable>

              {exSets.length === 0 ? (
                <AppText color="textSecondary">No sets logged.</AppText>
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
                    <AppText color="textSecondary">Set {s.set_index}</AppText>
                    <AppText>
                      {(s.weight ?? 0).toString()} × {(s.reps ?? 0).toString()}
                      {s.is_completed === 1 ? '' : ' (edit)'}
                    </AppText>
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
