import React, { useMemo } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import { getWorkoutPlanById } from '../db/workoutPlanRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

export function WorkoutPlanDetailScreen({ route }: Props) {
  const { workoutPlanId } = route.params;

  const plan = useMemo(() => getWorkoutPlanById(workoutPlanId), [workoutPlanId]);

  if (!plan) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Not found</AppText>
        <AppText color="textSecondary">This workout plan no longer exists.</AppText>
      </Screen>
    );
  }

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.xs }}>
        <AppText variant="title">{plan.name}</AppText>
        <AppText color="textSecondary">Weeks and days coming next.</AppText>
      </View>

      <View
        style={{
          padding: tokens.spacing.lg,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: tokens.colors.border,
          backgroundColor: tokens.colors.surface,
          gap: tokens.spacing.sm,
        }}
      >
        <AppText variant="subtitle">Week 1</AppText>
        <AppText color="textSecondary">Day 1 • (placeholder)</AppText>
        <AppText color="textSecondary">Day 2 • (placeholder)</AppText>
      </View>
    </Screen>
  );
}
