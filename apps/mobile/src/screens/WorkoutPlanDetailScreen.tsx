import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import type { RootStackParamList } from '../navigation/types';
import { Screen, Header, Card, EmptyState, SectionHeader, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { getWorkoutPlanById, type WorkoutPlanRow } from '../db/workoutPlanRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

export function WorkoutPlanDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { workoutPlanId } = route.params;
  const [plan, setPlan] = useState<WorkoutPlanRow | null>(null);

  const load = useCallback(() => {
    setPlan(getWorkoutPlanById(workoutPlanId));
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );


  return (
    <Screen
      scroll
      contentStyle={{
        gap: tokens.spacing.lg,
        paddingBottom: tokens.spacing.lg + insets.bottom + tokens.layout.tabBarHeight,
      }}
    >
      <Header title={plan?.name ?? 'Plan'} subtitle="Workout plan" showBack onBack={navigation.goBack} />

      {plan ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <SectionHeader title="Overview" />
          {plan.description ? (
            <Text variant="body">{plan.description}</Text>
          ) : (
            <Text variant="muted">No description yet.</Text>
          )}
        </View>
      ) : (
        <Card>
          <EmptyState
            icon={<Ionicons name="alert-circle-outline" size={24} color={tokens.colors.mutedText} />}
            title="Plan not found"
            description="This plan may have been deleted."
          />
        </Card>
      )}
    </Screen >
  );
}
