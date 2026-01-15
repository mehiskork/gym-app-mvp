import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import {
  getSessionById,
  listSessionExercises,
  type WorkoutSessionExerciseRow,
  type WorkoutSessionRow,
} from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

export function WorkoutSessionScreen({ route }: Props) {
  const { sessionId } = route.params;

  const [session, setSession] = useState<WorkoutSessionRow | null>(null);
  const [exercises, setExercises] = useState<WorkoutSessionExerciseRow[]>([]);

  const load = useCallback(() => {
    const s = getSessionById(sessionId);
    setSession(s);
    setExercises(s ? listSessionExercises(sessionId) : []);
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Session not found</AppText>
        <AppText color="textSecondary">This workout session no longer exists.</AppText>
      </Screen>
    );
  }

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.xs }}>
        <AppText variant="title">{session.title}</AppText>
        <AppText color="textSecondary">Status: {session.status}</AppText>
      </View>

      <View style={{ gap: tokens.spacing.sm }}>
        <AppText color="textSecondary">Exercises (snapshot)</AppText>
        {exercises.length === 0 ? (
          <AppText color="textSecondary">No exercises in this day.</AppText>
        ) : (
          exercises.map((e) => (
            <View
              key={e.id}
              style={{
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              }}
            >
              <AppText variant="subtitle">{e.exercise_name}</AppText>
            </View>
          ))
        )}
      </View>

      <AppText color="textSecondary">
        Logging UI comes next (Step 6): sets, timer, prefill, finish workout.
      </AppText>
    </Screen>
  );
}
