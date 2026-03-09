import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import {
  Screen,
  Card,
  EmptyState,
  Text,
  ListRow,
  IconChip,
  Button,
  Input,
  DestructiveConfirmDialog,
} from '../ui';
import { useAppTheme } from '../theme/theme';
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
  const mode = route.params.mode ?? 'edit';
  const [plan, setPlan] = useState<WorkoutPlanRow | null>(null);
  const [days, setDays] = useState<WorkoutPlanDayRow[]>([]);
  const [planName, setPlanName] = useState('');
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);
  const [deletePlanVisible, setDeletePlanVisible] = useState(false);
  const { colors } = useAppTheme();
  const load = useCallback(() => {
    const nextPlan = getWorkoutPlanById(workoutPlanId);
    setPlan(nextPlan);
    setDays(nextPlan ? listDaysForWorkoutPlan(workoutPlanId) : []);
    setPlanName(nextPlan?.name ?? '');
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'pickSessionToStart') {
        const existingSession = getInProgressSession();
        if (existingSession) {
          setPickerNotice('Resume active workout');
          navigation.replace('WorkoutSession', { sessionId: existingSession.id });
          return;
        }
      }
      load();
    }, [load, mode, navigation]),
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
    setDeletePlanVisible(true);
  }, []);

  const handleDeletePlan = useCallback(() => {
    deleteWorkoutPlan(workoutPlanId);
    setDeletePlanVisible(false);
    navigation.goBack();
  }, [navigation, workoutPlanId]);

  const sessionCountLabel = `${days.length} session${days.length === 1 ? '' : 's'}`;
  const isPickerMode = mode === 'pickSessionToStart';
  const handleDayPress = useCallback(
    (dayId: string) => {
      if (isPickerMode) {
        const existingSession = getInProgressSession();
        if (existingSession) {
          setPickerNotice('Resume active workout');
          navigation.replace('WorkoutSession', { sessionId: existingSession.id });
          return;
        }
        const sessionId = createSessionFromPlanDay({ workoutPlanId, dayId });
        navigation.replace('WorkoutSession', { sessionId });
        return;
      }

      navigation.navigate('DayDetail', { dayId, mode: 'edit' });
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
                editable={!isPickerMode}
                onChangeText={isPickerMode ? undefined : setPlanName}
                onBlur={isPickerMode ? undefined : persistPlanName}
                maxLength={50}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={isPickerMode ? undefined : persistPlanName}
              />
              {plan.description ? <Text variant="muted">{plan.description}</Text> : null}
              <Text variant="muted">{sessionCountLabel}</Text>
              {isPickerMode && pickerNotice ? <Text variant="muted">{pickerNotice}</Text> : null}
            </View>
          </Card>

          {days.length > 0 ? (
            <View style={{ gap: tokens.spacing.sm }}>
              <Text variant={isPickerMode ? 'title' : 'label'} color={tokens.colors.mutedText}>
                {isPickerMode ? 'Pick a session' : 'Sessions'}
              </Text>
              {days.map((day) => (
                <ListRow
                  key={day.id}
                  title={day.name ?? `Session ${day.day_index}`}
                  subtitle={isPickerMode ? undefined : 'Tap to edit'}
                  left={
                    <IconChip variant="primarySoft" size={40}>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
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
                icon={<Ionicons name="calendar-outline" size={24} color={colors.primary} />}
                title="No sessions yet"
                description="Add your first session to start logging."
                action={
                  isPickerMode ? null : (
                    <Button title="Add session" variant="secondary" onPress={handleAddDay} />
                  )
                }
              />
            </Card>
          )}
          {isPickerMode ? null : (
            <View style={{ gap: tokens.spacing.sm }}>
              {days.length > 0 ? (
                <Button title="Add session" variant="secondary" onPress={handleAddDay} />
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
      <DestructiveConfirmDialog
        visible={deletePlanVisible}
        title="Delete workout plan?"
        body={`"${plan?.name ?? 'This plan'}" will be deleted from this device.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeletePlanVisible(false)}
        onConfirm={handleDeletePlan}
      />
    </Screen>
  );
}
