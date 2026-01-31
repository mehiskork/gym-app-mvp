import React from 'react';
import { View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'pr' | 'completed' | 'planned' | 'goal';

type BadgeProps = {
    label: string;
    variant?: Variant;
};

const variantStyles: Record<Variant, { backgroundColor: string; color: string }> = {
    pr: { backgroundColor: tokens.colors.warning, color: tokens.colors.onPrimary },
    completed: { backgroundColor: tokens.colors.success, color: tokens.colors.onPrimary },
    planned: { backgroundColor: tokens.colors.secondary, color: tokens.colors.onSecondary },
    goal: { backgroundColor: tokens.colors.primary, color: tokens.colors.onPrimary },
};

export function Badge({ label, variant = 'planned' }: BadgeProps) {
    const style = variantStyles[variant];

    return (
        <View
            style={{
                alignSelf: 'flex-start',
                borderRadius: tokens.radius.lg,
                paddingHorizontal: tokens.spacing.sm,
                paddingVertical: tokens.spacing.xs,
                backgroundColor: style.backgroundColor,
            }}
        >
            <Text variant="label" color={style.color}>
                {label}
            </Text>
        </View>
    );
}