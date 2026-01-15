import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import {
  listWorkoutPlans,
  type WorkoutPlanRow,
  listDaysForWorkoutPlan,
  type WorkoutPlanDayRow,
} from '../db/workoutPlanRepo';
import {
  createSessionFromPlanDay,
  discardSession,
  getInProgressSession,
} from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'StartWorkout'>;

export function StartWorkoutScreen({ navigation }: Props) {
  const [plans, setPlans] = useState<WorkoutPlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);
  const [inProgressId, setInProgressId] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => (selectedPlanId ? (plans.find((p) => p.id === selectedPlanId) ?? null) : null),
    [plans, selectedPlanId],
  );

  const load = useCallback(() => {
    const inProg = getInProgressSession();
    setInProgressId(inProg?.id ?? null);

    const p = listWorkoutPlans();
    setPlans(p);

    if (!selectedPlanId) {
      setDays([]);
      return;
    }

    const stillExists = p.some((x) => x.id === selectedPlanId);
    if (!stillExists) {
      setSelectedPlanId(null);
      setDays([]);
      return;
    }

    setDays(listDaysForWorkoutPlan(selectedPlanId));
  }, [selectedPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (inProgressId) {
    return (
      <Screen style={{ gap: tokens.spacing.lg }}>
        <AppText variant="title">Workout in progress</AppText>
        <AppText color="textSecondary">You can only have one workout active at a time.</AppText>

        <PrimaryButton
          title="Resume workout"
          onPress={() => navigation.replace('WorkoutSession', { sessionId: inProgressId })}
        />

        <SecondaryButton
          title="Discard workout"
          onPress={() => {
            Alert.alert(
              'Discard workout?',
              'This will end the in-progress workout so you can start a new one.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => {
                    discardSession(inProgressId);
                    setInProgressId(null);
                    load();
                  },
                },
              ],
            );
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <AppText variant="title">Start workout</AppText>

      {plans.length === 0 ? (
        <AppText color="textSecondary">Create a workout plan first.</AppText>
      ) : (
        <>
          <View style={{ gap: tokens.spacing.sm }}>
            <AppText color="textSecondary">Choose workout plan</AppText>
            {plans.map((p) => {
              const isSelected = p.id === selectedPlanId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setSelectedPlanId(p.id);
                    setDays(listDaysForWorkoutPlan(p.id));
                  }}
                  style={({ pressed }) => [
                    {
                      padding: tokens.spacing.md,
                      backgroundColor: tokens.colors.surface,
                      borderRadius: tokens.radius.md,
                      borderWidth: 1,
                      borderColor: isSelected ? tokens.colors.text : tokens.colors.border,
                    },
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                >
                  <AppText variant="subtitle">{p.name}</AppText>
                </Pressable>
              );
            })}
          </View>

          {selectedPlan ? (
            <View style={{ gap: tokens.spacing.sm }}>
              <AppText color="textSecondary">Choose day</AppText>
              {days.map((d) => {
                const label = d.name ?? `Day ${d.day_index}`;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => {
                      try {
                        const sessionId = createSessionFromPlanDay({
                          workoutPlanId: selectedPlan.id,
                          dayId: d.id,
                        });
                        navigation.replace('WorkoutSession', { sessionId });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : 'Failed to start workout';
                        if (msg.startsWith('WORKOUT_IN_PROGRESS:')) {
                          const existingId = msg.split(':')[1] ?? '';
                          navigation.replace('WorkoutSession', { sessionId: existingId });
                          return;
                        }
                        Alert.alert('Error', msg);
                      }
                    }}
                    style={({ pressed }) => [
                      {
                        padding: tokens.spacing.md,
                        backgroundColor: tokens.colors.surface,
                        borderRadius: tokens.radius.md,
                        borderWidth: 1,
                        borderColor: tokens.colors.border,
                      },
                      pressed ? { opacity: 0.85 } : null,
                    ]}
                  >
                    <AppText variant="subtitle">{label}</AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <AppText color="textSecondary">Select a plan to see its days.</AppText>
          )}
        </>
      )}
    </Screen>
  );
}
