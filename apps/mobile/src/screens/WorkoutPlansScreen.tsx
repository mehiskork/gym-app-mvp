import React, { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, EmptyState, ListRow, IconChip, Button, IconButton, Text } from '../ui';
import { tokens } from '../theme/tokens';
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  listWorkoutPlansWithSessionCounts,
  type WorkoutPlanWithSessionCountRow,
  listWorkoutPlans,
  type WorkoutPlanRow,
} from '../db/workoutPlanRepo';
import type { RootStackParamList } from '../navigation/types';

function formatSessionCountSubtitle(sessionCount: number): string {
  if (sessionCount === 0) return 'No sessions yet';
  if (sessionCount === 1) return '1 session';
  return `${sessionCount} sessions`;
}

function getNextDefaultPlanName(plans: WorkoutPlanRow[]): string {
  const maxPlanNumber = plans.reduce((max, plan) => {
    const match = /^Plan\s+(\d+)$/i.exec(plan.name.trim());
    if (!match) return max;

    const value = Number(match[1]);
    if (!Number.isInteger(value)) return max;
    return Math.max(max, value);
  }, 0);

  return `Plan ${maxPlanNumber + 1}`;
}
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutPlansScreen() {
  const navigation = useNavigation<Nav>();

  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlanWithSessionCountRow[]>([]);

  const load = useCallback(() => {
    setWorkoutPlans(listWorkoutPlansWithSessionCounts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onCreate = () => {
    try {
      const defaultName = getNextDefaultPlanName(listWorkoutPlans());
      const workoutPlanId = createWorkoutPlan({ name: defaultName });
      navigation.navigate('WorkoutPlanDetail', { workoutPlanId });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create workout plan';
      Alert.alert('Error', message);
    }
  };

  const confirmDelete = (plan: WorkoutPlanWithSessionCountRow) => {
    Alert.alert('Delete workout plan?', `"${plan.name}" will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteWorkoutPlan(plan.id);
          load();
        },
      },
    ]);
  };

  return (
    <Screen
      scroll
      bottomInset="tabBar"
      contentStyle={{
        gap: tokens.spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="+ Create Plan" onPress={onCreate} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Templates"
            variant="primary"
            leftIcon={<Ionicons name="flash-outline" size={16} />}
            onPress={() => navigation.navigate('PrebuiltPlans')}
          />
        </View>
      </View>
      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="label" color={tokens.colors.mutedText}>
          MY PLANS
        </Text>
        <FlatList
          data={workoutPlans}
          keyExtractor={(p) => p.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
          ListEmptyComponent={
            <Card>
              <EmptyState
                icon={<Ionicons name="barbell-outline" size={24} color={tokens.colors.mutedText} />}
                title="No workout plans yet"
                description="Create a plan or browse templates to get started."
              />
            </Card>
          }
          renderItem={({ item }) => {
            const hasSessions = item.sessionCount > 0;

            return (
              <ListRow
                title={item.name}
                subtitle={formatSessionCountSubtitle(item.sessionCount)}
                showChevron={hasSessions}
                left={
                  <IconChip variant="muted" size={40}>
                    <Ionicons name="barbell-outline" size={18} color={tokens.colors.mutedText} />
                  </IconChip>
                }
                onPress={
                  hasSessions
                    ? () => navigation.navigate('WorkoutPlanDetail', { workoutPlanId: item.id })
                    : undefined
                }
                right={
                  <IconButton
                    onPress={() => confirmDelete(item)}
                    accessibilityLabel="Delete workout plan"
                    variant="danger"
                    icon={<Ionicons name="trash-outline" size={20} />}
                  />
                }
              />
            );
          }}
        />
      </View>
    </Screen>
  );
}
