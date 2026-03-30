import React from 'react';
import { View } from 'react-native';

import { Badge, Card, Text } from '../../ui';
import { tokens } from '../../theme/tokens';
import { formatDateTime } from '../../utils/format';
import type { WorkoutSessionStatus } from '../../db/constants';

type WorkoutSessionHeaderCardProps = {
  status: WorkoutSessionStatus;
  startedAt?: string | null;
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

export function WorkoutSessionHeaderCard({ status, startedAt }: WorkoutSessionHeaderCardProps) {
  return (
    <Card style={{ gap: tokens.spacing.sm, padding: tokens.spacing.md }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.sm }}
      >
        {startedAt ? (
          <Text variant="muted">Started {formatDateTime(startedAt)}</Text>
        ) : (
          <Text variant="muted">Session active</Text>
        )}
        <Badge label={statusLabels[status]} variant={statusVariants[status]} />
      </View>
    </Card>
  );
}
