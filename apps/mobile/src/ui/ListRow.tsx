import React from 'react';
import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'card' | 'flat';

type ListRowProps = {
    title: string;
    subtitle?: string;
    left?: ReactNode;
    right?: ReactNode;
    showChevron?: boolean;
    onPress?: PressableProps['onPress'];
    variant?: Variant;
    style?: StyleProp<ViewStyle>;
};

export function ListRow({
    title,
    subtitle,
    left,
    right,
    showChevron = true,
    onPress,
    variant = 'card',
    style,
}: ListRowProps) {
    const containerStyle: ViewStyle = {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
        padding: tokens.spacing.md,
        backgroundColor: variant === 'card' ? tokens.colors.surface : 'transparent',
        borderRadius: variant === 'card' ? tokens.radius.md : 0,
        borderWidth: variant === 'card' ? 1 : 0,
        borderBottomWidth: variant === 'flat' ? 1 : 0,
        borderColor: variant === 'card' ? tokens.colors.border : tokens.colors.border,
    };

    const content = (
        <View style={[containerStyle, style]}>
            {left ? <View>{left}</View> : null}
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                <Text variant="subtitle">{title}</Text>
                {subtitle ? (
                    <Text variant="muted" style={{ lineHeight: 18 }}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {right ? <View style={{ marginLeft: tokens.spacing.sm }}>{right}</View> : null}
            {showChevron ? (
                <Ionicons name="chevron-forward" size={18} color={tokens.colors.mutedText} />
            ) : null}
        </View>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={title}
                style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
            >
                {content}
            </Pressable>
        );
    }

    return content;
}