import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type SectionHeaderProps = {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    actionNode?: ReactNode;
};

export function SectionHeader({ title, actionLabel, onAction, actionNode }: SectionHeaderProps) {
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: tokens.spacing.sm,
            }}
        >
            <Text variant="label" color={tokens.colors.mutedText}>
                {title}
            </Text>
            {actionNode ? (
                actionNode
            ) : actionLabel && onAction ? (
                <Pressable onPress={onAction} style={({ pressed }) => [pressed ? { opacity: 0.7 } : null]}>
                    <Text variant="label" color={tokens.colors.primary}>
                        {actionLabel}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}