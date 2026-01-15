import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import {
  listWorkoutPlans,
  type WorkoutPlanRow,
  listDaysForWorkoutPlan,
  type WorkoutPlanDayRow,
} from '../db/workoutPlanRepo';
import { createSessionFromPlanDay } from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'StartWorkout'>;

export function StartWorkoutScreen({ navigation }: Props) {
  const [plans, setPlans] = useState<WorkoutPlanRow[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);

  const selectedPlan = useMemo(
    () => (selectedPlanId ? (plans.find((p) => p.id === selectedPlanId) ?? null) : null),
    [plans, selectedPlanId],
  );

  const load = useCallback(() => {
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
                      const sessionId = createSessionFromPlanDay({
                        workoutPlanId: selectedPlan.id,
                        dayId: d.id,
                      });
                      navigation.replace('WorkoutSession', { sessionId });
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
