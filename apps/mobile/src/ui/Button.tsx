import React from 'react';
import type { ReactNode } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Size = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'children'> & {
    title?: string;
    children?: ReactNode;
    variant?: Variant;
    size?: Size;
    leftIcon?: ReactNode;
    disabled?: boolean;
    loading?: boolean;
};

const sizeStyles: Record<Size, ViewStyle> = {
    sm: {
        minHeight: tokens.touchTargetMin,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.md,
    },
    md: {
        minHeight: 48,
        paddingVertical: tokens.spacing.sm,
        paddingHorizontal: tokens.spacing.lg,
    },
    lg: {
        minHeight: 52,
        paddingVertical: tokens.spacing.md,
        paddingHorizontal: tokens.spacing.xl,
    },
};

const variantStyles: Record<Variant, ViewStyle> = {
    primary: {
        backgroundColor: tokens.colors.primary,
        borderColor: tokens.colors.primary,
    },
    secondary: {
        backgroundColor: tokens.colors.secondary,
        borderColor: tokens.colors.border,
    },
    ghost: {
        backgroundColor: 'transparent',
        borderColor: tokens.colors.border,
    },
    destructive: {
        backgroundColor: tokens.colors.danger,
        borderColor: tokens.colors.danger,
    },
};

const variantTextColors: Record<Variant, string> = {
    primary: tokens.colors.onPrimary,
    secondary: tokens.colors.onSecondary,
    ghost: tokens.colors.text,
    destructive: tokens.colors.text,
};

export function Button({
    title,
    children,
    variant = 'primary',
    size = 'md',
    leftIcon,
    disabled,
    loading,
    style,
    ...props
}: ButtonProps) {
    const isDisabled = disabled || loading;
    const content = children ?? title;

    return (
        <Pressable
            {...props}
            disabled={isDisabled}
            style={({ pressed }) => [
                {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.md,
                    borderWidth: variant === 'ghost' || variant === 'secondary' ? 1 : 0,
                    opacity: isDisabled ? 0.6 : 1,
                },
                sizeStyles[size],
                variantStyles[variant],
                pressed && !isDisabled ? { opacity: 0.85 } : null,
                style as ViewStyle,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={variantTextColors[variant]} />
            ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {leftIcon ? <View style={{ marginRight: tokens.spacing.sm }}>{leftIcon}</View> : null}
                    {typeof content === 'string' ? (
                        <Text variant="body" weight="600" color={variantTextColors[variant]}>
                            {content}
                        </Text>
                    ) : (
                        content
                    )}
                </View>
            )}
        </Pressable>
    );
}