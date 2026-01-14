import React, { useCallback, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { createWorkoutPlan, listWorkoutPlans, type WorkoutPlanRow } from '../db/workoutPlanRepo';

export function WorkoutPlansScreen() {
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlanRow[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(() => {
    setWorkoutPlans(listWorkoutPlans());
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

  return (
    <Screen>
      <AppText variant="title" style={{ marginBottom: tokens.spacing.md }}>
        Workout Plans
      </AppText>

      <View style={{ gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg }}>
        <AppText color="textSecondary">New workout plan name</AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g., Push Pull Legs"
          placeholderTextColor={tokens.colors.textSecondary}
          style={{
            minHeight: tokens.touchTargetMin,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: tokens.colors.border,
            paddingHorizontal: tokens.spacing.md,
            color: tokens.colors.text,
            backgroundColor: tokens.colors.surface,
          }}
        />
        <PrimaryButton title="Create workout plan" onPress={onCreate} disabled={!name.trim()} />
      </View>

      <FlatList
        data={workoutPlans}
        keyExtractor={(p) => p.id}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<AppText color="textSecondary">No workout plans yet.</AppText>}
        renderItem={({ item }) => (
          <View
            style={{
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
            }}
          >
            <AppText variant="subtitle">{item.name}</AppText>
            {item.description ? <AppText color="textSecondary">{item.description}</AppText> : null}
          </View>
        )}
      />
    </Screen>
  );
}
