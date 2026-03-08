import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'pr' | 'completed' | 'planned' | 'goal';

type BadgeProps = {
    label: string;
    variant?: Variant;
};


export function Badge({ label, variant = 'planned' }: BadgeProps) {
    const { colors } = useAppTheme();
    const variantStyles: Record<Variant, { backgroundColor: string; color: string }> = {
        pr: { backgroundColor: colors.warning, color: colors.onPrimary },
        completed: { backgroundColor: colors.success, color: colors.onPrimary },
        planned: { backgroundColor: colors.secondary, color: colors.onSecondary },
        goal: { backgroundColor: colors.primary, color: colors.onPrimary },
    };
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