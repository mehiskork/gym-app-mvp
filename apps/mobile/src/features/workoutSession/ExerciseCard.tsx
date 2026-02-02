import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, Card, Text } from '../../ui';
import { tokens } from '../../theme/tokens';


type ExerciseCardProps = {
    name: string;
    subtitle?: string | null;
    isActive?: boolean;
    onAddSet: () => void;
    onPressTitle?: () => void;
    children: ReactNode;
};

export function ExerciseCard({
    name,
    subtitle,
    isActive = false,
    onAddSet,
    onPressTitle,
    children,
}: ExerciseCardProps) {
    return (
        <Card style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
                <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                    <Pressable
                        onPress={onPressTitle}
                        style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
                    >
                        <Text variant="subtitle">{name}</Text>
                    </Pressable>
                    {subtitle ? (
                        <Text variant="muted" style={{ lineHeight: 18 }}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                {isActive ? <Badge label="Current" variant="goal" /> : null}
            </View>
            <View style={{ gap: tokens.spacing.sm }}>
                {children}
                <Pressable
                    testID="exercise-card-add-set"
                    onPress={onAddSet}
                    style={({ pressed }) => [
                        {
                            minHeight: tokens.touchTargetMin,
                            borderWidth: 1,
                            borderStyle: 'dashed',
                            borderColor: tokens.colors.border,
                            borderRadius: tokens.radius.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: tokens.spacing.sm,
                        },
                        pressed ? { opacity: 0.85 } : null,
                    ]}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                        <Ionicons name="add" size={16} color={tokens.colors.mutedText} />
                        <Text variant="muted" color={tokens.colors.mutedText}>
                            Add Set
                        </Text>
                    </View>
                </Pressable>
            </View>

        </Card>
    );
}