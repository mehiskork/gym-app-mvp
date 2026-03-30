import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/theme';
import { tokens } from '../../theme/tokens';
import { Button, Card, EmptyState, IconChip, Text } from '../../ui';

type TodayPrimaryActionProps = {
  hasActiveWorkout: boolean;
  activeWorkoutTitle?: string | null;
  onResume?: () => void;
  hasPlans: boolean;
  onStart?: () => void;
  onBrowsePlans?: () => void;
  onCreatePlan?: () => void;
};

export function TodayPrimaryAction({
  hasActiveWorkout,
  activeWorkoutTitle,
  onResume,
  hasPlans,
  onStart,
  onBrowsePlans,
  onCreatePlan,
}: TodayPrimaryActionProps) {
  const { colors } = useAppTheme();
  if (hasActiveWorkout) {
    return (
      <Card
        variant="tinted"
        style={{
          borderColor: colors.primaryBorder.replace(/\d*\.?\d+\)$/, '0.28)'),
          backgroundColor: colors.primarySoft,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
          <IconChip variant="primarySoft" size={56}>
            <Ionicons name="flame" size={26} color={colors.primary} />
          </IconChip>
          <View style={{ flex: 1, gap: tokens.spacing.xs }}>
            <Text variant="subtitle">Active Session</Text>
            <Text variant="muted">{activeWorkoutTitle ?? 'Resume your workout'}</Text>
          </View>
          <Button title="Resume" onPress={onResume} />
        </View>
      </Card>
    );
  }

  if (hasPlans) {
    return (
      <Pressable
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Start workout"
        style={({ pressed }) => [pressed ? { opacity: 0.94 } : null]}
      >
        <Card
          variant="tinted"
          style={{
            borderColor: colors.primaryBorder.replace(/\d*\.?\d+\)$/, '0.28)'),
            backgroundColor: colors.primarySoft,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
            <IconChip variant="primarySoft" size={56}>
              <Ionicons name="barbell" size={26} color={colors.primary} />
            </IconChip>
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
              <Text variant="subtitle">Start Training</Text>
              <Text variant="muted">Pick today&apos;s plan and go.</Text>
            </View>
            <Ionicons name="play" size={18} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
    );
  }
  return (
    <Card variant="dashed">
      <EmptyState
        icon={<Ionicons name="calendar-outline" size={26} color={colors.primary} />}
        title="No plan yet"
        description="Create or import a plan to start logging workouts."
        action={
          <View style={{ gap: tokens.spacing.sm, width: '100%' }}>
            <Button title="Browse plans" onPress={onBrowsePlans} />
            <Button title="Build a plan" variant="secondary" onPress={onCreatePlan} />
          </View>
        }
      />
    </Card>
  );
}
