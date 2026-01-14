import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import {
  createWorkoutPlan,
  deleteWorkoutPlan,
  listWorkoutPlans,
  type WorkoutPlanRow,
} from '../db/workoutPlanRepo';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function WorkoutPlansScreen() {
  const navigation = useNavigation<Nav>();

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

  const confirmDelete = (plan: WorkoutPlanRow) => {
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
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.spacing.sm,
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
            }}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={() => navigation.navigate('WorkoutPlanDetail', { workoutPlanId: item.id })}
            >
              <AppText variant="subtitle">{item.name}</AppText>
              <AppText color="textSecondary">Tap to open</AppText>
            </Pressable>

            <Pressable
              onPress={() => confirmDelete(item)}
              style={({ pressed }) => [
                {
                  minHeight: tokens.touchTargetMin,
                  minWidth: tokens.touchTargetMin,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: tokens.radius.sm,
                  borderWidth: 1,
                  borderColor: tokens.colors.border,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityLabel="Delete workout plan"
            >
              <Ionicons name="trash-outline" size={20} color={tokens.colors.textSecondary} />
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}
