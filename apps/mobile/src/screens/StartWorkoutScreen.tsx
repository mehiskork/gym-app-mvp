import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TAB_ROUTES } from '../navigation/routes';
import type { RootStackParamList } from '../navigation/types';
import { Screen, ListRow, IconChip } from '../ui';
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import {
  listWorkoutPlansWithSessionCounts,
  type WorkoutPlanWithSessionCountRow,
} from '../db/workoutPlanRepo';
import { getInProgressSession } from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'StartWorkout'>;

function formatSessionCountSubtitle(sessionCount: number): string {
  if (sessionCount === 0) return 'No sessions yet';
  if (sessionCount === 1) return '1 session';
  return `${sessionCount} sessions`;
}

export function StartWorkoutScreen({ navigation }: Props) {
  const [plans, setPlans] = useState<WorkoutPlanWithSessionCountRow[] | null>(null);
  const { colors } = useAppTheme();

  const load = useCallback(() => {
    const nextPlans = listWorkoutPlansWithSessionCounts();

    if (nextPlans.length === 0) {
      navigation.replace('MainTabs', { screen: TAB_ROUTES.WorkoutPlans });
      return;
    }

    if (nextPlans.length === 1) {
      const [plan] = nextPlans;
      if (plan.sessionCount > 0) {
        navigation.replace('WorkoutPlanDetail', {
          workoutPlanId: plan.id,
          mode: 'pickSessionToStart',
        });
        return;
      }

      navigation.replace('MainTabs', { screen: TAB_ROUTES.WorkoutPlans });
      return;
    }

    setPlans(nextPlans);
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const existingSession = getInProgressSession();
      if (existingSession) {
        navigation.replace('WorkoutSession', { sessionId: existingSession.id });
        return;
      }
      load();
    }, [load, navigation]),
  );

  return (
    <Screen scroll bottomInset="none" contentStyle={{}}>
      {plans ? (
        <FlatList
          data={plans}
          keyExtractor={(plan) => plan.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={formatSessionCountSubtitle(item.sessionCount)}
              showChevron={item.sessionCount > 0}
              left={
                <IconChip variant="primarySoft" size={40}>
                  <Ionicons name="barbell-outline" size={18} color={colors.primary} />
                </IconChip>
              }
              onPress={
                item.sessionCount > 0
                  ? () =>
                      navigation.navigate('WorkoutPlanDetail', {
                        workoutPlanId: item.id,
                        mode: 'pickSessionToStart',
                      })
                  : undefined
              }
            />
          )}
        />
      ) : null}
    </Screen>
  );
}
