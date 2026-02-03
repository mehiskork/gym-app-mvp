import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type HeaderProps = {
    title: string;
    subtitle?: string;
    showBack?: boolean;
    onBack?: () => void;
    rightAction?: ReactNode;
};

export function Header({ title, subtitle, showBack = false, onBack, rightAction }: HeaderProps) {
    const insets = useSafeAreaInsets();

    return (
        <View
            style={{
                paddingTop: insets.top + tokens.spacing.xs,
                paddingHorizontal: tokens.spacing.xs,
                paddingBottom: tokens.spacing.xs,
                backgroundColor: tokens.colors.bg,
                borderBottomWidth: 1,
                borderBottomColor: tokens.colors.border,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                    {showBack ? (
                        <Pressable
                            onPress={onBack}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                            style={({ pressed }) => [
                                {
                                    width: tokens.touchTargetMin,
                                    height: tokens.touchTargetMin,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: tokens.radius.md,
                                    borderWidth: 1,
                                    borderColor: tokens.colors.border,
                                },
                                pressed ? { opacity: 0.7 } : null,
                            ]}
                        >
                            <Ionicons name="chevron-back" size={20} color={tokens.colors.text} />
                        </Pressable>
                    ) : null}
                    <View>
                        <Text variant="label" color={tokens.colors.mutedText}>
                            {subtitle ?? 'FORGE'}
                        </Text>
                        <Text variant="h2">{title}</Text>
                    </View>
                </View>
                {rightAction ? <View>{rightAction}</View> : null}
            </View>
        </View>
    );
}