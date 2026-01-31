import React from 'react';
import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

import { tokens } from '../theme/tokens';

type Variant = 'default' | 'tinted' | 'dashed';

type CardProps = {
    children: ReactNode;
    onPress?: PressableProps['onPress'];
    style?: StyleProp<ViewStyle>;
    variant?: Variant;
};

const baseStyle: ViewStyle = {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.lg,
};

export function Card({ children, onPress, style, variant = 'default' }: CardProps) {
    const variantStyle: ViewStyle =
        variant === 'tinted'
            ? { backgroundColor: tokens.colors.surface2 }
            : variant === 'dashed'
                ? { borderStyle: 'dashed', backgroundColor: 'transparent' }
                : {};

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    baseStyle,
                    variantStyle,
                    pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null,
                    style,
                ]}
            >
                {children}
            </Pressable>
        );
    }

    return <View style={[baseStyle, variantStyle, style]}>{children}</View>;
}