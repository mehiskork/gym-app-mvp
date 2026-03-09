import React, { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useAppTheme } from '../theme/theme';
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
    const { colors } = useAppTheme();
    const isDisabled = disabled || loading;
    const content = children ?? title;
    const variantStyles: Record<Variant, ViewStyle> = {
        primary: {
            backgroundColor: colors.primary,
            borderColor: colors.primaryBorder,
            borderWidth: 1,
        },
        secondary: {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            borderWidth: 1,
        },
        ghost: {
            backgroundColor: 'transparent',
            borderColor: colors.border,
            borderWidth: 1,
        },
        destructive: {
            backgroundColor: colors.danger,
            borderColor: colors.danger,
            borderWidth: 1,
        },
    };
    const variantTextColors: Record<Variant, string> = {
        primary: colors.primaryTextOnColor,
        secondary: colors.onSecondary,
        ghost: colors.text,
        destructive: colors.text,
    };

    const leftIconNode =
        leftIcon && isValidElement(leftIcon)
            ? cloneElement(leftIcon as React.ReactElement<{ color?: string }>, {
                color: variantTextColors[variant],
            })
            : leftIcon;

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
                    opacity: isDisabled ? 0.6 : 1,
                },
                sizeStyles[size],
                variantStyles[variant],
                pressed && !isDisabled ? { opacity: 0.9 } : null,
                style as ViewStyle,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={variantTextColors[variant]} />
            ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {leftIconNode ? <View style={{ marginRight: tokens.spacing.sm }}>{leftIconNode}</View> : null}
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