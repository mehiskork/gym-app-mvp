import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen, Card, EmptyState, Text, ListRow, IconChip, Button } from '../ui';
import { tokens } from '../theme/tokens';
import {
  addDayToWorkoutPlan,
  deleteWorkoutPlan,
  getWorkoutPlanById,
  listDaysForWorkoutPlan,
  type WorkoutPlanDayRow,
  type WorkoutPlanRow,
} from '../db/workoutPlanRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

export function WorkoutPlanDetailScreen({ route, navigation }: Props) {
  const { workoutPlanId } = route.params;
  const [plan, setPlan] = useState<WorkoutPlanRow | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);

  const load = useCallback(() => {
    const nextPlan = getWorkoutPlanById(workoutPlanId);
    setPlan(nextPlan);
    setDays(nextPlan ? listDaysForWorkoutPlan(workoutPlanId) : []);
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );


  const handleAddDay = useCallback(() => {
    const dayId = addDayToWorkoutPlan(workoutPlanId);
    load();
    navigation.navigate('DayDetail', { dayId });
  }, [load, navigation, workoutPlanId]);

  const confirmDeletePlan = useCallback(() => {
    Alert.alert(
      'Delete workout plan?',
      `"${plan?.name ?? 'This plan'}" will be deleted from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteWorkoutPlan(workoutPlanId);
            navigation.goBack();
          },
        },
      ],
    );
  }, [navigation, plan?.name, workoutPlanId]);

  const dayCountLabel = `${days.length} day${days.length === 1 ? '' : 's'}`;

  return (
    <Screen
      scroll
      bottomInset="tabBar"
      contentStyle={{
        gap: tokens.spacing.md,
      }}
    >


      {plan ? (
        <>
          <Card>
            <View style={{ gap: tokens.spacing.sm }}>
              <Text variant="title">{plan.name}</Text>
              {plan.description ? <Text variant="muted">{plan.description}</Text> : null}
              <Text variant="muted">{dayCountLabel}</Text>
            </View>
          </Card>

          {days.length > 0 ? (
            <View style={{ gap: tokens.spacing.sm }}>
              <Text variant="label" color={tokens.colors.mutedText}>
                Training days
              </Text>
              {days.map((day) => (
                <ListRow
                  key={day.id}
                  title={day.name ?? `Day ${day.day_index}`}
                  subtitle="Tap to edit"
                  left={
                    <IconChip variant="muted" size={40}>
                      <Ionicons name="calendar-outline" size={18} color={tokens.colors.mutedText} />
                    </IconChip>
                  }
                  showChevron
                  onPress={() => navigation.navigate('DayDetail', { dayId: day.id })}
                />
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState
                icon={<Ionicons name="calendar-outline" size={24} color={tokens.colors.mutedText} />}
                title="No days yet"
                description="Add your first training day to start logging."
                action={<Button title="Add day" variant="secondary" onPress={handleAddDay} />}
              />
            </Card>
          )
          }
          <View style={{ gap: tokens.spacing.sm }}>
            {days.length > 0 ? (
              <Button title="Add day" variant="secondary" onPress={handleAddDay} />
            ) : null}
            <Button title="Delete plan" variant="destructive" onPress={confirmDeletePlan} />
          </View>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Ionicons name="alert-circle-outline" size={24} color={tokens.colors.mutedText} />}
            title="Plan not found"
            description="This plan may have been deleted."
          />
        </Card>
      )}
    </Screen>
  );
}
