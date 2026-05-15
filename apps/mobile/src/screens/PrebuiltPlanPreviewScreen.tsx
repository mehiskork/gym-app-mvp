import React, { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import {
  getPrebuiltPlanPreview,
  importPrebuiltPlan,
  type PrebuiltPlanPreview,
} from '../db/prebuiltPlansRepo';
import { getInProgressSession } from '../db/workoutSessionRepo';
import { Button, Card, EmptyState, Screen, Snackbar, Text } from '../ui';
import { tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PrebuiltPlanPreview'>;

export function PrebuiltPlanPreviewScreen({ route, navigation }: Props) {
  const { templateId } = route.params;
  const [preview, setPreview] = useState<PrebuiltPlanPreview | null>(() =>
    getPrebuiltPlanPreview(templateId),
  );
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: 'info' | 'error' } | null>(
    null,
  );

  const handleImport = () => {
    if (!preview || preview.existingPlanId || importing) return;

    try {
      setImporting(true);
      const planId = importPrebuiltPlan(preview.templateId);
      setPreview({ ...preview, existingPlanId: planId });
      const existingSession = getInProgressSession();
      if (existingSession) {
        setFeedback({ message: 'Added to plans.', variant: 'info' });
        return;
      }
      navigation.replace('WorkoutPlanDetail', {
        workoutPlanId: planId,
        mode: 'pickSessionToStart',
      });
    } catch {
      setFeedback({ message: "Couldn't complete that action. Try again.", variant: 'error' });
    } finally {
      setImporting(false);
    }
  };

  if (!preview) {
    return (
      <Screen scroll bottomInset="none">
        <Card>
          <EmptyState
            icon={
              <Ionicons name="alert-circle-outline" size={24} color={tokens.colors.mutedText} />
            }
            title="Plan not found"
            description="This template may no longer be available."
          />
        </Card>
      </Screen>
    );
  }

  const sessionCountLabel = `${preview.sessionCount} session${preview.sessionCount === 1 ? '' : 's'}`;

  return (
    <Screen scroll bottomInset="none" contentStyle={{ gap: tokens.spacing.md }}>
      <Card>
        <View style={{ gap: tokens.spacing.sm }}>
          <Text variant="title">{preview.name}</Text>
          {preview.description ? <Text variant="muted">{preview.description}</Text> : null}
          <Text variant="muted">{sessionCountLabel}</Text>
          <Button
            title={
              preview.existingPlanId
                ? 'Added to plans'
                : importing
                  ? 'Importing...'
                  : 'Add to my plans'
            }
            onPress={handleImport}
            disabled={importing || preview.existingPlanId !== null}
          />
        </View>
      </Card>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="label" color={tokens.colors.mutedText}>
          SESSIONS
        </Text>
        {preview.sessions.map((session) => (
          <Card key={session.id}>
            <View style={{ gap: tokens.spacing.sm }}>
              <Text variant="subtitle">{session.name}</Text>
              <View style={{ gap: tokens.spacing.xs }}>
                {session.exercises.map((exercise) => (
                  <Text key={exercise.id} variant="muted">
                    {exercise.name}
                  </Text>
                ))}
              </View>
            </View>
          </Card>
        ))}
      </View>

      <Snackbar
        visible={feedback !== null}
        message={feedback?.message ?? ''}
        variant={feedback?.variant ?? 'info'}
        onDismiss={() => setFeedback(null)}
      />
    </Screen>
  );
}
