import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { completeSession } from '../db/workoutSessionRepo';
import { DEFAULT_REST_SECONDS } from '../db/constants';
import {
  addWorkoutSet,
  clearRestTimer,
  getWorkoutLoggerData,
  startRestTimer,
  updateWorkoutSet,
  deleteWorkoutSet,
  type LoggerExercise,
  type LoggerSession,
  type LoggerSet,
} from '../db/workoutLoggerRepo';
import { formatMMSS, formatOptionalNumber, secondsElapsed } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}


export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<LoggerSession | null>(null);
  const [exercises, setExercises] = useState<LoggerExercise[]>([]);
  const [tick, setTick] = useState(0);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    const data = getWorkoutLoggerData(sessionId);
    setSession(data.session);
    setExercises(data.exercises);
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    // lightweight timer tick for countdown UI (DB remains source of truth)
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session?.title) navigation.setOptions({ title: session.title });
    }, [navigation, session?.title]),
  );

  const elapsed = useMemo(
    () => secondsElapsed(session?.rest_timer_end_at ?? null),
    [session?.rest_timer_end_at, tick],
  );

  const timerActive = (session?.rest_timer_end_at ?? null) !== null;

  const onFinish = () => {
    Alert.alert('Finish workout?', 'This will mark the session as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        style: 'default',
        onPress: () => {
          completeSession(sessionId);
          clearRestTimer(sessionId);
          load();
          navigation.navigate('MainTabs', { screen: 'Today' });
        },
      },
    ]);
  };

  const renderSetRow = (set: LoggerSet, wse: LoggerExercise) => {
    const setLabel = `Set ${set.set_index}`;
    const done = set.is_completed === 1;

    return (
      <View
        key={set.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          paddingVertical: tokens.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: tokens.colors.border,
        }}
      >
        <View style={{ width: 56 }}>
          <AppText color="textSecondary">{setLabel}</AppText>
        </View>

        <View style={{ flex: 1, flexDirection: 'row', gap: tokens.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText color="textSecondary">kg</AppText>
            <TextInput
              defaultValue={formatOptionalNumber(set.weight, 2)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              style={{
                minHeight: tokens.touchTargetMin,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                paddingHorizontal: tokens.spacing.md,
                color: tokens.colors.text,
                backgroundColor: tokens.colors.surface,
              }}
              onEndEditing={(e) => {
                updateWorkoutSet(set.id, { weight: parseNumber(e.nativeEvent.text) });
                load();
              }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <AppText color="textSecondary">reps</AppText>
            <TextInput
              defaultValue={set.reps === null ? '' : String(set.reps)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              style={{
                minHeight: tokens.touchTargetMin,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                paddingHorizontal: tokens.spacing.md,
                color: tokens.colors.text,
                backgroundColor: tokens.colors.surface,
              }}
              onEndEditing={(e) => {
                const n = parseNumber(e.nativeEvent.text);
                updateWorkoutSet(set.id, { reps: n === null ? null : Math.max(0, Math.floor(n)) });
                load();
              }}
            />
          </View>
        </View>

        <Pressable
          onPress={() => {
            updateWorkoutSet(set.id, { is_completed: done ? 0 : 1 });
            void Haptics.selectionAsync();

            // Start rest timer when marking done
            if (!done) {
              const seconds = set.rest_seconds ?? DEFAULT_REST_SECONDS;
              startRestTimer(sessionId, seconds, wse.exercise_name);
            }
            load();
          }}
          style={({ pressed }) => [
            {
              minHeight: tokens.touchTargetMin,
              minWidth: tokens.touchTargetMin,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: tokens.radius.sm,
              borderWidth: 1,
              borderColor: done ? tokens.colors.text : tokens.colors.border,
              backgroundColor: done ? tokens.colors.text : 'transparent',
            },
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityLabel="Toggle set complete"
        >
          <Ionicons
            name="checkmark"
            size={18}
            color={done ? tokens.colors.background : tokens.colors.textSecondary}
          />
        </Pressable>

        <Pressable
          onPress={() => {
            Alert.alert('Delete set?', `${wse.exercise_name} • ${setLabel}`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  deleteWorkoutSet(set.id);
                  load();
                },
              },
            ]);
          }}
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
          accessibilityLabel="Delete set"
        >
          <Ionicons name="trash-outline" size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      </View>
    );
  };

  if (!session) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Loading…</AppText>
      </Screen>
    );
  }

  return (
    <Screen style={{ flex: 1 }}>
      {timerActive ? (
        <View
          style={{
            padding: tokens.spacing.md,
            backgroundColor: tokens.colors.surface,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: tokens.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: tokens.spacing.sm,
            marginBottom: tokens.spacing.lg,

            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">Rest: {formatMMSS(elapsed)}</AppText>
          </View>

          <Pressable
            onPress={() => {
              // Hide immediately
              setSession((prev) =>
                prev
                  ? {
                    ...prev,
                    rest_timer_end_at: null,
                    rest_timer_label: null,
                    rest_timer_seconds: null,
                  }
                  : prev,
              );

              // Persist
              clearRestTimer(sessionId);
            }}
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
            accessibilityLabel="Clear rest timer"
          >
            <Ionicons name="trash-outline" size={18} color={tokens.colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ gap: tokens.spacing.lg, paddingBottom: tokens.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: tokens.spacing.sm }}>
          <AppText variant="title">{session.title}</AppText>
        </View>

        {exercises.map((ex) => (
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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: tokens.spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: ex.exercise_id })
                  }
                  style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                >
                  <AppText variant="subtitle">{ex.exercise_name}</AppText>
                </Pressable>
              </View>

              <SecondaryButton
                title="+ Set"
                onPress={() => {
                  addWorkoutSet(ex.id);
                  void Haptics.selectionAsync();
                  load();
                }}
              />
            </View>

            <View>{ex.sets.map((s) => renderSetRow(s, ex))}</View>
          </View>
        ))}

        <PrimaryButton title="Finish workout" onPress={onFinish} />
      </ScrollView>
    </Screen>
  );
}
