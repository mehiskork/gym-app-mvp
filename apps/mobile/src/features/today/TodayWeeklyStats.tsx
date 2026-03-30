import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/theme';
import { tokens } from '../../theme/tokens';
import { SectionHeader, StatCard } from '../../ui';
import { formatVolume } from './format';

type TodayWeeklyStatsProps = {
  workouts: number;
  totalKg: number;
};

export function TodayWeeklyStats({ workouts, totalKg }: TodayWeeklyStatsProps) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <SectionHeader title="This Week" />
      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <StatCard
            label="Workouts"
            value={workouts.toString()}
            icon={<Ionicons name="calendar" size={18} color={colors.primary} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <StatCard
            label="Volume"
            value={`${formatVolume(totalKg)} kg`}
            icon={<Ionicons name="stats-chart" size={18} color={colors.primary} />}
          />
        </View>
      </View>
    </View>
  );
}
