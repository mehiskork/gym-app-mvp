import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card, Text } from '../../ui';
import { tokens } from '../../theme/tokens';

type ExerciseCardProps = {
    name: string;
    subtitle?: string | null;
    onAddSet: () => void;
    onCommentPress?: () => void;
    commentButtonLabel?: 'Add comment' | 'View comment';
    commentDisabled?: boolean;
    onPressTitle?: () => void;
    onSwap?: () => void;
    showAddSet?: boolean;
    children: ReactNode;
};

export function ExerciseCard({
    name,
    subtitle,
    onAddSet,
    onCommentPress,
    commentButtonLabel = 'Add comment',
    commentDisabled = false,
    onPressTitle,
    onSwap,
    showAddSet = true,
    children,
}: ExerciseCardProps) {
    const hasSets = React.Children.count(children) > 0;

    return (
        <Card style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md }}>
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
                {onSwap ? (
                    <Pressable
                        onPress={onSwap}
                        accessibilityLabel={`Swap ${name}`}
                        style={({ pressed }) => [
                            {
                                minHeight: 32,
                                paddingHorizontal: tokens.spacing.sm,
                                backgroundColor: tokens.colors.surface,
                                borderWidth: 1,
                                borderColor: tokens.colors.border,
                                borderRadius: tokens.radius.sm,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: tokens.spacing.xs,
                            },
                            pressed ? { opacity: 0.8 } : null,
                        ]}
                    >
                        <Ionicons
                            name="swap-horizontal"
                            size={14}
                            color={tokens.colors.mutedText}
                            accessibilityElementsHidden
                            importantForAccessibility="no"
                        />
                        <Text variant="muted" style={{ fontSize: tokens.typography.caption.fontSize }}>
                            Swap
                        </Text>
                    </Pressable>
                ) : null}
            </View>
            <View style={{ gap: tokens.spacing.sm }}>
                {hasSets ? (
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: tokens.spacing.xs,
                            paddingHorizontal: tokens.spacing.sm,
                        }}
                    >
                        <View style={{ flex: 1.0, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
                            <View style={{ width: 24 }}>
                                <Text
                                    variant="label"
                                    color={tokens.colors.mutedText}
                                    style={{
                                        fontSize: tokens.typography.caption.fontSize,
                                    }}
                                >
                                    SET
                                </Text>
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', gap: tokens.spacing.sm }}>
                                <View style={{ flex: 1.2 }}>
                                    <Text
                                        variant="label"
                                        color={tokens.colors.mutedText}
                                        style={{
                                            fontSize: tokens.typography.caption.fontSize,
                                        }}
                                    >
                                        WEIGHT
                                    </Text>
                                </View>
                                <View style={{ flex: 0.7 }}>
                                    <Text
                                        variant="label"
                                        color={tokens.colors.mutedText}
                                        style={{
                                            fontSize: tokens.typography.caption.fontSize,
                                        }}
                                    >
                                        REPS
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View style={{ width: tokens.touchTargetMin * 2 + tokens.spacing.xs }} />
                    </View>
                ) : null}
                {children}
                <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm }}>
                    <Pressable
                        testID="exercise-card-comment"
                        onPress={onCommentPress}
                        disabled={commentDisabled}
                        style={({ pressed }) => [
                            {
                                flex: 1,
                                minHeight: tokens.touchTargetMin,
                                borderWidth: 1,
                                borderColor: tokens.colors.border,
                                borderRadius: tokens.radius.md,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: commentDisabled ? 0.6 : 1,
                            },
                            pressed && !commentDisabled ? { opacity: 0.85 } : null,
                        ]}
                    >
                        <Text variant="muted" color={tokens.colors.mutedText}>
                            {commentButtonLabel}

                        </Text>
                    </Pressable>
                    {showAddSet ? (
                        <Pressable
                            testID="exercise-card-add-set"
                            onPress={onAddSet}
                            style={({ pressed }) => [
                                {
                                    flex: 1,
                                    minHeight: tokens.touchTargetMin,
                                    borderWidth: 1,
                                    borderStyle: 'dashed',
                                    borderColor: tokens.colors.border,
                                    borderRadius: tokens.radius.md,
                                    alignItems: 'center',
                                    justifyContent: 'center',
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
                    ) : null}
                </View>
            </View>
        </Card >
    );
}