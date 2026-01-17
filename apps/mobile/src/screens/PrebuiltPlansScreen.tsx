import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { importPrebuiltPlan, listPrebuiltPlans } from '../db/prebuiltPlansRepo';
import { listDaysForWorkoutPlan } from '../db/workoutPlanRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PrebuiltPlansScreen() {
  const navigation = useNavigation<Nav>();
  const [importingId, setImportingId] = useState<string | null>(null);

  const templates = useMemo(() => listPrebuiltPlans(), []);
  const isBusy = importingId !== null;

  const handleImport = (templateId: string) => {
    try {
      setImportingId(templateId);
      const planId = importPrebuiltPlan(templateId);
      navigation.replace('WorkoutPlanDetail', { workoutPlanId: planId });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to import prebuilt plan';
      Alert.alert('Error', message);
    } finally {
      setImportingId(null);
    }
  };

  const handlePreview = (templateId: string, existingPlanId: string | null) => {
    try {
      setImportingId(templateId);
      const planId = existingPlanId ?? importPrebuiltPlan(templateId);
      const days = listDaysForWorkoutPlan(planId);
      if (days.length === 0) {
        Alert.alert('No days found', 'This plan has no days to preview.');
        return;
      }
      navigation.replace('DayDetail', { dayId: days[0].id });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to open plan preview';
      Alert.alert('Error', message);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <Screen>
      <AppText variant="title" style={{ marginBottom: tokens.spacing.md }}>
        Prebuilt plans
      </AppText>
      <AppText color="textSecondary" style={{ marginBottom: tokens.spacing.lg }}>
        Import a template to start editing and logging workouts.
      </AppText>

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<AppText color="textSecondary">No templates available.</AppText>}
        renderItem={({ item }) => (
          <View
            style={[
              {
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
              },
            ]}
          >
            <AppText variant="subtitle">{item.name}</AppText>
            {item.description ? (
              <AppText color="textSecondary">{item.description}</AppText>
            ) : null}
            <AppText color="textSecondary">{item.dayCount} days</AppText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                marginTop: tokens.spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={
                    item.existingPlanId
                      ? 'Added to plans'
                      : importingId === item.id
                        ? 'Importing...'
                        : 'Add to my plans'
                  }
                  onPress={() => handleImport(item.id)}
                  disabled={isBusy || item.existingPlanId !== null}
                />
              </View>
              <Pressable
                onPress={() => handlePreview(item.id, item.existingPlanId)}
                disabled={isBusy}
                style={({ pressed }) => [
                  {
                    minHeight: tokens.touchTargetMin,
                    minWidth: tokens.touchTargetMin,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.sm,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                    backgroundColor: tokens.colors.surface,
                  },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="View plan days"
              >
                <Ionicons name="information-circle-outline" size={20} color={tokens.colors.text} />
              </Pressable>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}