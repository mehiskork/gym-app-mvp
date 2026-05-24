import React from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BottomSheetModal, Button, Input, Text } from '../../ui';
import { tokens } from '../../theme/tokens';

type FinishWorkoutSheetProps = {
  visible: boolean;
  onClose: () => void;
  onFinish: () => void;
  mode?: 'normal' | 'incomplete' | 'noLoggedWork';
  completedSets: number;
  totalSets: number;
  durationMinutes: number;
  isFinishing?: boolean;
  workoutNote: string;
  onWorkoutNoteChange: (value: string) => void;
  noteEditable?: boolean;
};

const MAX_WORKOUT_NOTE_LENGTH = 200;

const formatDuration = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const StatColumn = ({ label, value }: { label: string; value: ReactNode }) => (
  <View style={{ alignItems: 'center', flex: 1 }}>
    <Text variant="label" color={tokens.colors.mutedText}>
      {label}
    </Text>
    <Text variant="title" weight="700" style={{ marginTop: tokens.spacing.xs }}>
      {value}
    </Text>
  </View>
);

export function FinishWorkoutSheet({
  visible,
  onClose,
  onFinish,
  mode = 'normal',
  completedSets,
  totalSets,
  durationMinutes,
  isFinishing = false,
  workoutNote,
  onWorkoutNoteChange,
  noteEditable = true,
}: FinishWorkoutSheetProps) {
  const incompleteSets = Math.max(0, totalSets - completedSets);
  const message = (() => {
    if (mode === 'noLoggedWork') {
      return 'No workout data was logged. End this workout without saving it to history?';
    }
    if (mode === 'incomplete' && incompleteSets > 0) {
      return `You have ${incompleteSets} incomplete sets. Finish anyway?`;
    }
    return 'Finish and save this workout?';
  })();
  const keepTrainingLabel = mode === 'noLoggedWork' ? 'Keep training' : 'Keep Training';
  const finishLabel = mode === 'noLoggedWork' ? 'End without saving' : 'Finish';
  const actions = (
    <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
      <View style={{ flex: 1 }}>
        <Button
          title={keepTrainingLabel}
          variant="secondary"
          onPress={onClose}
          disabled={isFinishing}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          title={finishLabel}
          variant="primary"
          onPress={onFinish}
          disabled={isFinishing}
          loading={isFinishing}
        />
      </View>
    </View>
  );

  return (
    <BottomSheetModal
      visible={visible}
      title="Finish Workout?"
      onClose={onClose}
      testID="finish-sheet"
      keyboardAware
      actions={actions}
    >
      <View style={{ gap: tokens.spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: tokens.spacing.lg,
          }}
        >
          {StatColumn({ label: 'Sets Completed', value: completedSets })}
          <View style={{ height: 48, width: 1, backgroundColor: tokens.colors.border }} />
          {StatColumn({ label: 'Duration', value: formatDuration(durationMinutes) })}
        </View>
        <Input
          label="Workout note (optional)"
          value={workoutNote}
          onChangeText={(value) => onWorkoutNoteChange(value.slice(0, MAX_WORKOUT_NOTE_LENGTH))}
          placeholder="Add an optional note for this session"
          maxLength={MAX_WORKOUT_NOTE_LENGTH}
          editable={noteEditable}
          multiline
          textAlignVertical="top"
          inputStyle={{ minHeight: 90, paddingVertical: tokens.spacing.sm }}
          helperText={`${workoutNote.length}/${MAX_WORKOUT_NOTE_LENGTH}`}
        />
        <Text variant="body" color={tokens.colors.mutedText} style={{ textAlign: 'center' }}>
          {message}
        </Text>
      </View>
    </BottomSheetModal>
  );
}
