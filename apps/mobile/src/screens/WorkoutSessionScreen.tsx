import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { Button, Card, EmptyState, IconChip, Screen, Text } from '../ui';
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

} from '../db/workoutLoggerRepo';
import { formatMMSS, secondsElapsed } from '../utils/format';
import { ExerciseCard } from '../features/workoutSession/ExerciseCard';
import { SetRow } from '../features/workoutSession/SetRow';
import { WorkoutSessionHeaderCard } from '../features/workoutSession/WorkoutSessionHeaderCard';


type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

const REST_TIMER_HEIGHT = 92;

function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function getActiveSetId(exercise: LoggerExercise): string | null {
  const firstIncomplete = exercise.sets.find((set) => set.is_completed === 0);
  if (firstIncomplete) return firstIncomplete.id;
  return exercise.sets[exercise.sets.length - 1]?.id ?? null;
}

function getExerciseSubtitle(exercise: LoggerExercise): string | null {
  if (exercise.sets.length === 0) return null;
  const completed = exercise.sets.filter((set) => set.is_completed === 1).length;
  return `${completed}/${exercise.sets.length} sets complete`;
}


export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<LoggerSession | null>(null);
  const [exercises, setExercises] = useState<LoggerExercise[]>([]);
  const [tick, setTick] = useState(0);

  const insets = useSafeAreaInsets();
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



  const activeExerciseId = useMemo(() => {
    return (
      exercises.find((exercise) => exercise.sets.some((set) => set.is_completed === 0))?.id ??
      exercises[0]?.id ??
      null
    );
  }, [exercises]);
  const footerPaddingBottom = Math.max(insets.bottom, tokens.spacing.sm);
  const footerHeight = tokens.touchTargetMin + tokens.spacing.sm + footerPaddingBottom;
  const scrollPaddingTop = timerActive
    ? tokens.spacing.lg + REST_TIMER_HEIGHT + tokens.spacing.md
    : tokens.spacing.lg;
  if (!session) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Text variant="title">Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      bottomInset="none"
      contentStyle={{ paddingTop: 0 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}

      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: scrollPaddingTop,
            paddingBottom: footerHeight + tokens.spacing.lg,
            gap: tokens.spacing.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          <WorkoutSessionHeaderCard
            title={session.title}
            status={session.status}
            startedAt={session.started_at}
          />


          {exercises.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Ionicons name="barbell-outline" size={24} color={tokens.colors.mutedText} />}
                title="No exercises yet"
                description="Add exercises to start logging your sets."
              />
            </Card>
          ) : (
            exercises.map((ex) => {
              const activeSetId = getActiveSetId(ex);
              return (
                <ExerciseCard
                  key={ex.id}
                  name={ex.exercise_name}
                  subtitle={getExerciseSubtitle(ex)}
                  isActive={ex.id === activeExerciseId}
                  onPressTitle={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: ex.exercise_id })
                  }
                  onAddSet={() => {
                    addWorkoutSet(ex.id);
                    void Haptics.selectionAsync();
                    load();
                  }}
                >
                  {ex.sets.map((set) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      isActive={set.id === activeSetId}
                      onWeightEndEditing={(value) => {
                        updateWorkoutSet(set.id, { weight: parseNumber(value) });
                        load();
                      }}
                      onRepsEndEditing={(value) => {
                        const n = parseNumber(value);
                        updateWorkoutSet(set.id, {
                          reps: n === null ? null : Math.max(0, Math.floor(n)),
                        });
                        load();
                      }}
                      onToggleComplete={() => {
                        const done = set.is_completed === 1;
                        updateWorkoutSet(set.id, { is_completed: done ? 0 : 1 });
                        void Haptics.selectionAsync();
                        // Start rest timer when marking done
                        if (!done) {
                          const seconds = set.rest_seconds ?? DEFAULT_REST_SECONDS;
                          startRestTimer(sessionId, seconds, ex.exercise_name);
                        }
                        load();
                      }}
                      onDelete={() => {
                        Alert.alert('Delete set?', `${ex.exercise_name} • Set ${set.set_index}`, [
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
                    />
                  ))}
                </ExerciseCard>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {timerActive ? (
        <Card
          style={{
            position: 'absolute',
            top: insets.top + tokens.spacing.sm,
            left: tokens.spacing.lg,
            right: tokens.spacing.lg,
            zIndex: 50,
            elevation: 50,
            gap: tokens.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
            <IconChip variant="primaryTint" size={40}>
              <Ionicons name="timer-outline" size={20} color={tokens.colors.primary} />
            </IconChip>
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
              <Text variant="label" color={tokens.colors.mutedText}>
                Rest
              </Text>
              <Text variant="mono">{formatMMSS(elapsed)}</Text>
              {session.rest_timer_label ? (
                <Text variant="muted">{session.rest_timer_label}</Text>
              ) : null}
            </View>
            <Button
              title="Clear"
              variant="ghost"
              size="sm"
              leftIcon={<Ionicons name="trash-outline" size={16} color={tokens.colors.text} />}
              onPress={() => {
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

                clearRestTimer(sessionId);
              }}
            />
          </View>
        </Card>
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: tokens.spacing.sm,
          paddingBottom: footerPaddingBottom,
          backgroundColor: tokens.colors.surface,
          borderTopWidth: 1,
          borderTopColor: tokens.colors.border,
        }}
      >
        <Button title="Finish workout" variant="destructive" onPress={onFinish} />
      </View>
    </Screen>
  );
}
