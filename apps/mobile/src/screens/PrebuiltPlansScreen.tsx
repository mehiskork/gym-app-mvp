import React, { useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Button, IconButton, Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { importPrebuiltPlan, listPrebuiltPlans } from '../db/prebuiltPlansRepo';
import { listDaysForWorkoutPlan } from '../db/workoutPlanRepo';
import { getInProgressSession } from '../db/workoutSessionRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PrebuiltPlansScreen() {
  const navigation = useNavigation<Nav>();
  const [importingId, setImportingId] = useState<string | null>(null);

  const [templates, setTemplates] = useState(() => listPrebuiltPlans());
  const isBusy = importingId !== null;

  const handleImport = (templateId: string) => {
    try {
      setImportingId(templateId);
      const planId = importPrebuiltPlan(templateId);
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === templateId ? { ...template, existingPlanId: planId } : template,
        ),
      );
      const existingSession = getInProgressSession();
      if (existingSession) {
        return;
      }
      navigation.replace('WorkoutPlanDetail', {
        workoutPlanId: planId,
        mode: 'pickSessionToStart',
      });
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
        Alert.alert('No sessions found', 'This plan has no sessions to preview.');
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
    <Screen bottomInset="none">
      <Text variant="muted" style={{ marginBottom: tokens.spacing.lg }}>
        Import a template to start editing and logging workouts.
      </Text>

      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<Text variant="muted">No templates available.</Text>}
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
            <Text variant="subtitle">{item.name}</Text>
            {item.description ? <Text variant="muted">{item.description}</Text> : null}
            <Text variant="muted">
              {item.dayCount} session{item.dayCount === 1 ? '' : 's'}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                marginTop: tokens.spacing.sm,
              }}
            >
              <View style={{ flex: 1 }}>
                <Button
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
              <IconButton
                onPress={() => handlePreview(item.id, item.existingPlanId)}
                disabled={isBusy}

                accessibilityLabel="View plan sessions"

                icon={<Ionicons name="information-circle-outline" size={20} />}
              />
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
