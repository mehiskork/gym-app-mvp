import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge, Button, Card, Text } from '../../ui';
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
                <Button
                    title="+ Set"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Ionicons name="add" size={16} color={tokens.colors.onSecondary} />}
                    onPress={onAddSet}
                />
            </View>
            <View style={{ gap: tokens.spacing.sm }}>{children}</View>
        </Card>
    );
}