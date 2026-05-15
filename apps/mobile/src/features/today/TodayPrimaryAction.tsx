import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/theme';
import { tokens } from '../../theme/tokens';
import { Button, Card, IconChip, Text } from '../../ui';

type TodayPrimaryActionProps = {
  hasActiveWorkout: boolean;
  activeWorkoutTitle?: string | null;
  onResume?: () => void;
  hasPlans: boolean;
  onStart?: () => void;
  onQuickStart?: () => void;
};

export function TodayPrimaryAction({
  hasActiveWorkout,
  activeWorkoutTitle,
  onResume,
  hasPlans,
  onStart,
  onQuickStart,
}: TodayPrimaryActionProps) {
  const { colors } = useAppTheme();
  const highlightedCardStyle = {
    borderColor: colors.primaryBorder.replace(/\d*\.?\d+\)$/, '0.28)'),
    backgroundColor: colors.primarySoft,
  };

  if (hasActiveWorkout) {
    return (
      <Card variant="tinted" style={highlightedCardStyle}>
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

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Pressable
        onPress={onQuickStart}
        accessibilityRole="button"
        accessibilityLabel="Quick workout"
        style={({ pressed }) => [pressed ? { opacity: 0.94 } : null]}
      >
        <Card variant="tinted" style={highlightedCardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
            <IconChip variant="primarySoft" size={56}>
              <Ionicons name="barbell" size={26} color={colors.primary} />
            </IconChip>
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
              <Text variant="subtitle">Quick Workout</Text>
              <Text variant="muted">Add exercises as you go.</Text>
            </View>
            <Ionicons name="play" size={18} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
      <Pressable
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Planned workout"
        style={({ pressed }) => [pressed ? { opacity: 0.94 } : null]}
      >
        <Card variant="tinted" style={highlightedCardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
            <IconChip variant="primarySoft" size={56}>
              <Ionicons name="calendar-outline" size={26} color={colors.primary} />
            </IconChip>
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
              <Text variant="subtitle">Planned Workout</Text>
              <Text variant="muted">
                {hasPlans ? 'Follow your next planned session.' : 'Create or choose a plan first.'}
              </Text>
            </View>
            <Ionicons name="play" size={18} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
    </View>
  );
}
