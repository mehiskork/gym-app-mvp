import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { tokens } from '../theme/tokens';

type Variant = 'primarySolid' | 'primaryTint' | 'muted';

type IconChipProps = {
    children: ReactNode;
    variant?: Variant;
    size?: number;
    style?: StyleProp<ViewStyle>;
};

const sizeStyles: Record<number, ViewStyle> = {
    40: { width: 40, height: 40, borderRadius: tokens.radius.lg },
    44: { width: 44, height: 44, borderRadius: tokens.radius.lg },
    56: { width: 56, height: 56, borderRadius: tokens.radius.xl },
};

const variantStyles: Record<Variant, ViewStyle> = {
    primarySolid: {
        backgroundColor: tokens.colors.primary,
    },
    primaryTint: {
        backgroundColor: 'rgba(245, 138, 42, 0.15)',
    },
    muted: {
        backgroundColor: tokens.colors.surface2,
    },
};

export function IconChip({ children, variant = 'muted', size = 44, style }: IconChipProps) {
    const baseStyle: ViewStyle = {
        alignItems: 'center',
        justifyContent: 'center',
    };

    return (
        <View style={[baseStyle, sizeStyles[size] ?? sizeStyles[44], variantStyles[variant], style]}>
            {children}
        </View>
    );
}