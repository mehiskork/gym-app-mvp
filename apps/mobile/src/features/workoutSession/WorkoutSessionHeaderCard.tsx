import React from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Text } from '../../ui';
import { tokens } from '../../theme/tokens';
import { formatDateTime } from '../../utils/format';
import type { WorkoutSessionStatus } from '../../db/constants';


type WorkoutSessionHeaderCardProps = {
    title: string;
    status: WorkoutSessionStatus;
    startedAt?: string | null;
    totalSets: number;
    completedSets: number;
    onFinish: () => void;
};

const statusLabels: Record<WorkoutSessionStatus, string> = {
    in_progress: 'In progress',
    completed: 'Completed',
    discarded: 'Discarded',
};

const statusVariants: Record<WorkoutSessionStatus, 'planned' | 'completed' | 'goal'> = {
    in_progress: 'goal',
    completed: 'completed',
    discarded: 'planned',
};

export function WorkoutSessionHeaderCard({
    title,
    status,
    startedAt,
    totalSets,
    completedSets,
    onFinish,
}: WorkoutSessionHeaderCardProps) {
    return (
        <Card style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.md }}>
                <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                    <Text variant="h2">{title}</Text>
                    {startedAt ? (
                        <Text variant="muted">Started {formatDateTime(startedAt)}</Text>
                    ) : null}
                </View>
                <Badge label={statusLabels[status]} variant={statusVariants[status]} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
                <View
                    style={{
                        borderRadius: tokens.radius.lg,
                        paddingHorizontal: tokens.spacing.md,
                        paddingVertical: tokens.spacing.sm,
                        backgroundColor: tokens.colors.surface2,
                    }}
                >
                    <Text variant="label" color={tokens.colors.mutedText}>
                        Sets
                    </Text>
                    <Text variant="subtitle">{completedSets}/{totalSets}</Text>
                </View>
            </View>

            <Button title="Finish workout" variant="destructive" onPress={onFinish} />
        </Card>
    );
}