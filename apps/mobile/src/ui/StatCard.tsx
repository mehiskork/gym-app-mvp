import React from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

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
    const resolvedTrendLabel = trendLabel ?? (trend === 'down' ? 'Declining' : 'Improving');
    const trendColor = trend === 'down' ? tokens.colors.warning : tokens.colors.success;

    return (
        <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="label" color={tokens.colors.mutedText}>
                    {label}
                </Text>
                {icon ? (
                    <View
                        style={{
                            backgroundColor: tokens.colors.surface2,
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