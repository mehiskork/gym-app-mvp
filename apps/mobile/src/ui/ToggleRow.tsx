import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Switch, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type Variant = 'card' | 'flat';

type ToggleRowProps = {
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (next: boolean) => void;
    style?: StyleProp<ViewStyle>;
    variant?: Variant;
};

export function ToggleRow({
    title,
    subtitle,
    value,
    onValueChange,
    style,
    variant = 'card',
}: ToggleRowProps) {
    const containerStyle: ViewStyle = {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
        padding: tokens.spacing.md,
        backgroundColor: variant === 'card' ? tokens.colors.surface : 'transparent',
        borderRadius: variant === 'card' ? tokens.radius.md : 0,
        borderWidth: variant === 'card' ? 1 : 0,
        borderBottomWidth: variant === 'flat' ? 1 : 0,
        borderColor: tokens.colors.border,
    };

    return (
        <View style={[containerStyle, style]}>
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                <Text variant="subtitle">{title}</Text>
                {subtitle ? (
                    <Text variant="muted" style={{ lineHeight: 18 }}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
                thumbColor={tokens.colors.surface}
                ios_backgroundColor={tokens.colors.border}
            />
        </View>
    );
}