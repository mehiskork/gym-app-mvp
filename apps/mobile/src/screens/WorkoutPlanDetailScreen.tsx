import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import {
  ensureDefaultWeekAndDays,
  getWorkoutPlanById,
  listDaysForWeek,
  listWeeksForWorkoutPlan,
  type WorkoutPlanDayRow,
  type WorkoutPlanWeekRow,
} from '../db/workoutPlanRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutPlanDetail'>;

type WeekWithDays = {
  week: WorkoutPlanWeekRow;
  days: WorkoutPlanDayRow[];
};

export function WorkoutPlanDetailScreen({ route }: Props) {
  const { workoutPlanId } = route.params;

  const [planName, setPlanName] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekWithDays[]>([]);

  const load = useCallback(() => {
    const plan = getWorkoutPlanById(workoutPlanId);
    setPlanName(plan?.name ?? null);

    const weekRows = listWeeksForWorkoutPlan(workoutPlanId);
    const combined: WeekWithDays[] = weekRows.map((w) => ({
      week: w,
      days: listDaysForWeek(w.id),
    }));
    setWeeks(combined);
  }, [workoutPlanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!planName) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <AppText variant="title">Not found</AppText>
        <AppText color="textSecondary">This workout plan no longer exists.</AppText>
      </Screen>
    );
  }

  const hasWeeks = weeks.length > 0;

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.xs }}>
        <AppText variant="title">{planName}</AppText>
        <AppText color="textSecondary">Weeks and days</AppText>
      </View>

      {!hasWeeks ? (
        <View style={{ gap: tokens.spacing.md }}>
          <AppText color="textSecondary">
            This plan has no weeks yet (it may have been created before we added defaults).
          </AppText>
          <PrimaryButton
            title="Generate Week 1"
            onPress={() => {
              ensureDefaultWeekAndDays(workoutPlanId);
              load();
            }}
          />
        </View>
      ) : (
        <FlatList
          data={weeks}
          keyExtractor={(item) => item.week.id}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.md }} />}
          renderItem={({ item }) => (
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
              <AppText variant="subtitle">Week {item.week.week_index}</AppText>
              {item.days.map((d) => (
                <AppText key={d.id} color="textSecondary">
                  {d.name ?? `Day ${d.day_index}`}
                </AppText>
              ))}
            </View>
          )}
        />
      )}
    </Screen>
  );
}
