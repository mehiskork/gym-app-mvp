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
    const variantStyles: Record<Variant, { backgroundColor: string; color: string; borderColor?: string }> = {
        pr: { backgroundColor: colors.warning, color: colors.primaryTextOnColor },
        completed: { backgroundColor: colors.success, color: colors.text },
        planned: { backgroundColor: colors.secondary, color: colors.onSecondary },
        goal: { backgroundColor: colors.primarySoft, color: colors.text, borderColor: colors.primaryBorder },
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
                borderWidth: style.borderColor ? 1 : 0,
                borderColor: style.borderColor,
            }}
        >
            <Text variant="label" color={style.color}>
                {label}
            </Text>
        </View>
    );
}