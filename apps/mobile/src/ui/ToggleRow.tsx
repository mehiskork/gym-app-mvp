import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Switch, View } from 'react-native';

import { useAppTheme } from '../theme/theme';
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
    const { colors } = useAppTheme();
    const containerStyle: ViewStyle = {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
        padding: tokens.spacing.md,
        backgroundColor: variant === 'card' ? colors.surface : 'transparent',
        borderRadius: variant === 'card' ? tokens.radius.md : 0,
        borderWidth: variant === 'card' ? 1 : 0,
        borderBottomWidth: variant === 'flat' ? 1 : 0,
        borderColor: colors.border,
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
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.thumb}
                ios_backgroundColor={colors.border}
            />
        </View>
    );
}