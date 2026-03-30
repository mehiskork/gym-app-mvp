import React from 'react';
import { View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { Text } from '../../ui';
import { formatDate } from './format';

type TodayHeroProps = {
  hasActiveWorkout: boolean;
  activeWorkoutTitle?: string | null;
  activePlanName?: string | null;
};

export function TodayHero({
  hasActiveWorkout,
  activeWorkoutTitle,
  activePlanName,
}: TodayHeroProps) {
  const title = hasActiveWorkout ? 'Workout in Progress' : 'Ready to Train?';
  const subtitle = hasActiveWorkout
    ? [activeWorkoutTitle, activePlanName].filter(Boolean).join(' · ')
    : formatDate(new Date());

  return (
    <View style={{ gap: tokens.spacing.xs }}>
      <Text variant="title">{title}</Text>
      <Text variant="muted">{subtitle}</Text>
    </View>
  );
}
