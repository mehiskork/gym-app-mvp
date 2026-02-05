import React, { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Card, EmptyState, Input, ListRow, IconChip, Button, IconButton } from '../ui';
import { tokens } from '../theme/tokens';
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  listWorkoutPlansWithDayCounts,
  type WorkoutPlanWithDayCountRow,
  listWorkoutPlans,
  type WorkoutPlanRow,
} from '../db/workoutPlanRepo';
import type { RootStackParamList } from '../navigation/types';

function formatDayCountSubtitle(dayCount: number): string {
  if (dayCount === 0) return 'No days yet';
  if (dayCount === 1) return '1 day';
  return `${dayCount} days`;
}


type Nav = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutPlansScreen() {
  const navigation = useNavigation<Nav>();

  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlanWithDayCountRow[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(() => {
    setWorkoutPlans(listWorkoutPlansWithDayCounts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onCreate = () => {
    try {
      createWorkoutPlan({ name });
      setName('');
      load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create workout plan';
      Alert.alert('Error', message);
    }
  };

  const confirmDelete = (plan: WorkoutPlanWithDayCountRow) => {
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
      <Card>
        <View style={{ gap: tokens.spacing.sm }}>
          <Input
            label="New workout plan name"
            maxLength={50}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Push Pull Legs"
          />
          <Button title="Build workout plan" onPress={onCreate} disabled={!name.trim()} />
        </View>
      </Card>

      <ListRow
        title="Browse templates"
        subtitle="Prebuilt plans to customize"
        onPress={() => navigation.navigate('PrebuiltPlans')}
      />

      <View style={{ gap: tokens.spacing.sm }}>
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
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={formatDayCountSubtitle(item.dayCount)}
              showChevron
              left={
                <IconChip variant="muted" size={40}>
                  <Ionicons name="barbell-outline" size={18} color={tokens.colors.mutedText} />
                </IconChip>
              }
              onPress={() => navigation.navigate('WorkoutPlanDetail', { workoutPlanId: item.id })}
              right={
                <IconButton
                  onPress={() => confirmDelete(item)}

                  accessibilityLabel="Delete workout plan"
                  variant="danger"
                  icon={<Ionicons name="trash-outline" size={20} />}
                />
              }
            />
          )}
        />
      </View>
    </Screen>
  );
}
