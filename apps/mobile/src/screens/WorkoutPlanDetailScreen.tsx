import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen, Card, EmptyState, Text, ListRow, IconChip, Button, Input } from '../ui';
import { tokens } from '../theme/tokens';
import {
  addDayToWorkoutPlan,
  deleteWorkoutPlan,
  getWorkoutPlanById,
  listDaysForWorkoutPlan,
  type WorkoutPlanDayRow,
  type WorkoutPlanRow,
  updateWorkoutPlanName,
} from '../db/workoutPlanRepo';
import { createSessionFromPlanDay, getInProgressSession } from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

export function WorkoutPlanDetailScreen({ route, navigation }: Props) {
  const { workoutPlanId } = route.params;
  const mode = route.params.mode ?? 'view';
  const [plan, setPlan] = useState<WorkoutPlanRow | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);
  const [planName, setPlanName] = useState('');
  const load = useCallback(() => {
    const nextPlan = getWorkoutPlanById(workoutPlanId);
    setPlan(nextPlan);
    setDays(nextPlan ? listDaysForWorkoutPlan(workoutPlanId) : []);
    setPlanName(nextPlan?.name ?? '');
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );


  const persistPlanName = useCallback(() => {
    const trimmedName = planName.trim();
    if (!plan || !trimmedName || trimmedName === plan.name) return;

    try {
      updateWorkoutPlanName(workoutPlanId, trimmedName);
      setPlan({ ...plan, name: trimmedName });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update plan name';
      Alert.alert('Error', message);
      setPlanName(plan.name);
    }
  }, [plan, planName, workoutPlanId]);

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
  const isPickerMode = mode === 'pickDayToStart';
  const daySubtitle = isPickerMode ? 'Start this day' : 'Tap to edit';

  const handleDayPress = useCallback(
    (dayId: string) => {
      if (isPickerMode) {
        const existingSession = getInProgressSession();
        if (existingSession) {
          navigation.replace('WorkoutSession', { sessionId: existingSession.id });
          return;
        }
        try {
          const sessionId = createSessionFromPlanDay({ workoutPlanId, dayId });
          navigation.replace('WorkoutSession', { sessionId });
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const prefix = 'WORKOUT_IN_PROGRESS:';
          if (message.startsWith(prefix)) {
            const sessionId = message.slice(prefix.length);
            navigation.replace('WorkoutSession', { sessionId });
            return;
          }
          throw error;
        }
        return;
      }

      navigation.navigate('DayDetail', { dayId });
    },
    [isPickerMode, navigation, workoutPlanId],
  );

  return (
    <Screen
      scroll
      bottomInset="none"
      contentStyle={{
        gap: tokens.spacing.md,
      }}
    >
      {plan ? (
        <>
          <Card>
            <View style={{ gap: tokens.spacing.sm }}>
              <Input
                label="Plan name"
                value={planName}
                onChangeText={setPlanName}
                onBlur={persistPlanName}
                maxLength={50}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={persistPlanName}
              />
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
                  subtitle={daySubtitle}
                  left={
                    <IconChip variant="muted" size={40}>
                      <Ionicons name="calendar-outline" size={18} color={tokens.colors.mutedText} />
                    </IconChip>
                  }
                  showChevron
                  onPress={() => handleDayPress(day.id)}
                />
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState
                icon={
                  <Ionicons name="calendar-outline" size={24} color={tokens.colors.mutedText} />
                }
                title="No days yet"
                description="Add your first training day to start logging."
                action={
                  isPickerMode ? null : (
                    <Button title="Add day" variant="secondary" onPress={handleAddDay} />
                  )
                }
              />
            </Card>
          )}
          {isPickerMode ? null : (
            <View style={{ gap: tokens.spacing.sm }}>
              {days.length > 0 ? (
                <Button title="Add day" variant="secondary" onPress={handleAddDay} />
              ) : null}
              <Button title="Delete plan" variant="destructive" onPress={confirmDeletePlan} />
            </View>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon={
              <Ionicons name="alert-circle-outline" size={24} color={tokens.colors.mutedText} />
            }
            title="Plan not found"
            description="This plan may have been deleted."
          />
        </Card>
      )}
    </Screen>
  );
}
