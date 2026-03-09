import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tokens } from '../../theme/tokens';
import { useAppTheme } from '../../theme/theme';
import { Badge, Card, EmptyState, IconChip, ListRow, SectionHeader, Text } from '../../ui';
import { formatDate, formatVolume } from './format';
import { parseTimestampMs } from '../../utils/timestamp';

type RecentSession = {
    id: string;
    title: string;
    startedAt: string;
    endedAt: string | null;
    volume: number;
    prs: number;
};

type TodayRecentActivityProps = {
    sessions: RecentSession[];
    onViewAll?: () => void;
    onOpenSession?: (sessionId: string) => void;
};

export function TodayRecentActivity({ sessions, onViewAll, onOpenSession }: TodayRecentActivityProps) {
    const hasSessions = sessions.length > 0;
    const { colors } = useAppTheme();

    return (
        <View style={{ gap: tokens.spacing.sm }}>
            <SectionHeader
                title="Recent Activity"
                actionLabel={hasSessions ? 'View All' : undefined}
                onAction={hasSessions ? onViewAll : undefined}
            />
            {hasSessions ? (
                <View style={{ gap: tokens.spacing.sm }}>
                    {sessions.slice(0, 3).map((session) => {
                        const timestampMs = parseTimestampMs(session.endedAt ?? session.startedAt);
                        const sessionDate = timestampMs === null ? new Date() : new Date(timestampMs);
                        const subtitle = `${formatDate(sessionDate)} · ${formatVolume(session.volume)} kg`;

                        return (
                            <ListRow
                                key={session.id}
                                title={session.title}
                                subtitle={subtitle}
                                left={
                                    <IconChip variant="primarySoft" size={40}>
                                        <Ionicons name="barbell" size={20} color={colors.primary} />
                                    </IconChip>
                                }
                                right={
                                    session.prs > 0 ? (
                                        <Badge label={`PR ${session.prs}`} variant="pr" />
                                    ) : (
                                        <Text variant="muted">Logged</Text>
                                    )
                                }
                                onPress={onOpenSession ? () => onOpenSession(session.id) : undefined}
                            />
                        );
                    })}
                </View>
            ) : (
                <Card>
                    <EmptyState
                        icon={<Ionicons name="time-outline" size={24} color={tokens.colors.mutedText} />}
                        title="No recent workouts"
                        description="Log your first session to see it here."
                    />
                </Card>
            )}
        </View>
    );
}