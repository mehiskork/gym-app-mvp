import React from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import { Card } from './Card';
import { Text } from './Text';

type Trend = 'up' | 'down' | null;

type StatCardProps = {
  label: string;
  value: string;
  icon?: ReactNode;
  trend?: Trend;
  trendLabel?: string;
};

export function StatCard({ label, value, icon, trend = null, trendLabel }: StatCardProps) {
  const { colors } = useAppTheme();
  const resolvedTrendLabel = trendLabel ?? (trend === 'down' ? 'Declining' : 'Improving');
  const trendColor = trend === 'down' ? colors.warning : colors.success;

  return (
    <Card style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" color={colors.mutedText}>
          {label}
        </Text>
        {icon ? (
          <View
            style={{
              backgroundColor: colors.primarySoft,
              borderColor: colors.primaryBorder,
              borderWidth: 1,
              borderRadius: tokens.radius.lg,
              padding: tokens.spacing.sm,
            }}
          >
            {icon}
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: tokens.spacing.sm }}>
        <Text variant="title" weight="700">
          {value}
        </Text>
        {trend ? (
          <Text variant="label" color={trendColor} style={{ marginTop: tokens.spacing.xs }}>
            {resolvedTrendLabel}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
