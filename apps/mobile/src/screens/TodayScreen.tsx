import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Screen } from '../ui';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { getInProgressSession } from '../db/workoutSessionRepo';
import { getWorkoutPlanById, listWorkoutPlans } from '../db/workoutPlanRepo';
import { getThisWeekSummary } from '../db/weeklyRepo';
import { listRecentSessionSummaries } from '../db/historyRepo';
import { TodayHero } from '../features/today/TodayHero';
import { TodayPrimaryAction } from '../features/today/TodayPrimaryAction';
import { TodayRecentActivity } from '../features/today/TodayRecentActivity';
import { TodayWeeklyStats } from '../features/today/TodayWeeklyStats';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const [inProgressId, setInProgressId] = useState<string | null>(null);
  const [inProgressTitle, setInProgressTitle] = useState<string | null>(null);
  const [inProgressPlan, setInProgressPlan] = useState<string | null>(null);
  const [hasPlans, setHasPlans] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [weeklyVolume, setWeeklyVolume] = useState(0);
  const [recentSessions, setRecentSessions] = useState(listRecentSessionSummaries(3));

  const load = useCallback(() => {
    const s = getInProgressSession();
    setInProgressId(s?.id ?? null);
    setInProgressTitle(s?.title ?? null);
    const planName = s?.source_workout_plan_id ? getWorkoutPlanById(s.source_workout_plan_id)?.name : null;
    setInProgressPlan(planName ?? null);
    setHasPlans(listWorkoutPlans().length > 0);
    const week = getThisWeekSummary();
    setWeeklyWorkouts(week.workouts);
    setWeeklyVolume(week.total_kg);
    setRecentSessions(listRecentSessionSummaries(3));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen
      scroll
      padded={false}
      bottomInset="tabBar"
    >

      <View style={{ paddingHorizontal: tokens.spacing.lg, paddingTop: tokens.spacing.lg, gap: tokens.spacing.lg }}>
        <TodayHero
          hasActiveWorkout={Boolean(inProgressId)}
          activeWorkoutTitle={inProgressTitle}
          activePlanName={inProgressPlan}
        />
        <TodayPrimaryAction
          hasActiveWorkout={Boolean(inProgressId)}
          activeWorkoutTitle={inProgressTitle ?? undefined}
          onResume={
            inProgressId ? () => navigation.navigate('WorkoutSession', { sessionId: inProgressId }) : undefined
          }
          hasPlans={hasPlans}
          onStart={() => navigation.navigate('StartWorkout')}
          onBrowsePlans={() => navigation.navigate('PrebuiltPlans')}
          onCreatePlan={() => navigation.navigate('MainTabs', { screen: 'WorkoutPlans' })}
        />
        <TodayWeeklyStats workouts={weeklyWorkouts} totalKg={weeklyVolume} />
        <TodayRecentActivity
          sessions={recentSessions.map((session) => ({
            id: session.id,
            title: session.title,
            startedAt: session.started_at,
            endedAt: session.ended_at,
            volume: session.volume,
            prs: session.prs,
          }))}
          onViewAll={() => navigation.navigate('MainTabs', { screen: 'History' })}
          onOpenSession={(sessionId) => navigation.navigate('SessionDetail', { sessionId })}
        />
      </View>
    </Screen >
  );
}
