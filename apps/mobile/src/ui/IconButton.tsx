import React, { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';
import { Pressable } from 'react-native';

import { tokens } from '../theme/tokens';

type IconButtonVariant = 'default' | 'danger' | 'muted' | 'ghost';

type IconButtonProps = {
    icon: ReactNode;
    onPress?: () => void;
    variant?: IconButtonVariant;
    size?: number;
    accessibilityLabel: string;
    disabled?: boolean;
} & Pick<PressableProps, 'onLongPress' | 'delayLongPress' | 'hitSlop' | 'testID'>;

const variantStyles: Record<
    IconButtonVariant,
    { backgroundColor: string; borderColor: string; iconColor: string }
> = {
    default: {
        backgroundColor: tokens.colors.surface,
        borderColor: tokens.colors.border,
        iconColor: tokens.colors.mutedText,
    },
    muted: {
        backgroundColor: tokens.colors.surface2,
        borderColor: tokens.colors.border,
        iconColor: tokens.colors.mutedText,
    },
    ghost: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        iconColor: tokens.colors.mutedText,
    },
    danger: {
        backgroundColor: tokens.colors.surface,
        borderColor: tokens.colors.border,
        iconColor: tokens.colors.destructive,
    },
};

export function IconButton({
    icon,
    onPress,
    onLongPress,
    delayLongPress,
    hitSlop,
    testID,
    variant = 'default',
    size = tokens.touchTargetMin,
    accessibilityLabel,
    disabled = false,
}: IconButtonProps) {
    const styles = variantStyles[variant];
    const iconNode = isValidElement(icon)
        ? cloneElement(icon as React.ReactElement<{ color?: string }>, { color: styles.iconColor })
        : icon;

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={delayLongPress}
            hitSlop={hitSlop}
            testID={testID}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
                {
                    minWidth: tokens.touchTargetMin,
                    minHeight: tokens.touchTargetMin,
                    width: size,
                    height: size,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.md,
                    borderWidth: variant === 'ghost' ? 0 : 1,
                    backgroundColor: styles.backgroundColor,
                    borderColor: styles.borderColor,
                    opacity: disabled ? 0.6 : 1,
                },
                pressed && !disabled ? { opacity: 0.85 } : null,
            ]}
        >
            {iconNode}
        </Pressable>
    );
}