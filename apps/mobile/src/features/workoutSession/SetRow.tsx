import React from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LoggerSet } from '../../db/workoutLoggerRepo';
import { IconButton, Text } from '../../ui';
import { useAppTheme } from '../../theme/theme';
import { tokens } from '../../theme/tokens';
import {
  SET_ACTIONS_GAP,
  SET_ACTIONS_WIDTH,
  SET_INPUT_GAP,
  SET_NUMBER_COLUMN_WIDTH,
  SET_ROW_GAP,
} from './setRowLayout';
import {
  formatRepsInputValue,
  formatWeightInputValue,
  parseRepsInput,
  parseWeightInput,
} from './setInputParsing';

type StrengthInputField = 'weight' | 'reps';

type SetRowProps = {
  set: LoggerSet;

  onWeightEndEditing: (value: string) => boolean;
  onRepsEndEditing: (value: string) => boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onEditFocus?: (metrics: { pageY: number; height: number }) => void;
};

export function SetRow({
  set,
  onWeightEndEditing,
  onRepsEndEditing,
  onToggleComplete,
  onDelete,
  onEditFocus,
}: SetRowProps) {
  const rowRef = React.useRef<View | null>(null);
  const repsInputRef = React.useRef<TextInput | null>(null);
  const { colors } = useAppTheme();
  const completed = set.is_completed === 1;
  const rowStyle = completed ? styles.completedRow : styles.row;
  const inputStyle = completed ? styles.completedInput : styles.input;
  const checkStyle = completed ? styles.checkCompleted : styles.check;
  const buttonSize = tokens.touchTargetMin;
  const inputPadding = tokens.spacing.md;
  const savedWeightText = formatWeightInputValue(set.weight);
  const savedRepsText = formatRepsInputValue(set.reps);
  const [weightText, setWeightText] = React.useState(savedWeightText);
  const [repsText, setRepsText] = React.useState(savedRepsText);
  const [focusedField, setFocusedField] = React.useState<StrengthInputField | null>(null);

  React.useEffect(() => {
    setWeightText(savedWeightText);
  }, [savedWeightText]);

  React.useEffect(() => {
    setRepsText(savedRepsText);
  }, [savedRepsText]);

  const handleEditFocus = React.useCallback(() => {
    if (!onEditFocus || !rowRef.current) return;
    rowRef.current.measureInWindow((_x, pageY, _width, height) => {
      onEditFocus({ pageY, height });
    });
  }, [onEditFocus]);

  const handleInputFocus = React.useCallback(
    (field: StrengthInputField) => {
      setFocusedField(field);
      handleEditFocus();
    },
    [handleEditFocus],
  );

  const handleInputBlur = React.useCallback(() => {
    setFocusedField(null);
  }, []);

  const handleWeightEndEditing = React.useCallback(
    (value: string) => {
      const parsed = parseWeightInput(value);
      if (!parsed.ok) {
        setWeightText(savedWeightText);
        return;
      }

      const accepted = onWeightEndEditing(value);
      setWeightText(accepted ? formatWeightInputValue(parsed.value) : savedWeightText);
    },
    [onWeightEndEditing, savedWeightText],
  );

  const handleRepsEndEditing = React.useCallback(
    (value: string) => {
      const parsed = parseRepsInput(value);
      if (!parsed.ok) {
        setRepsText(savedRepsText);
        return;
      }

      const accepted = onRepsEndEditing(value);
      setRepsText(accepted ? formatRepsInputValue(parsed.value) : savedRepsText);
    },
    [onRepsEndEditing, savedRepsText],
  );

  return (
    <View ref={rowRef} style={rowStyle}>
      <View style={[styles.leftCluster, { gap: SET_INPUT_GAP }]}>
        <View style={[styles.setLabel, { width: SET_NUMBER_COLUMN_WIDTH }]}>
          <Text
            testID="set-number"
            variant="body"
            color={tokens.colors.mutedText}
            numberOfLines={1}
            ellipsizeMode="clip"
            style={styles.setNumberText}
          >
            {set.set_index}
          </Text>
        </View>
        <View style={[styles.inputs, { gap: SET_INPUT_GAP }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              testID="weight-input"
              value={weightText}
              maxLength={5}
              selectTextOnFocus
              keyboardType="decimal-pad"
              returnKeyType="next"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              style={[
                inputStyle,
                focusedField === 'weight' ? { borderColor: colors.primary } : null,
                { paddingHorizontal: inputPadding },
              ]}
              onChangeText={setWeightText}
              onEndEditing={(e) => handleWeightEndEditing(e.nativeEvent.text)}
              onFocus={() => handleInputFocus('weight')}
              onBlur={handleInputBlur}
              onSubmitEditing={() => repsInputRef.current?.focus()}
            />
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              ref={repsInputRef}
              testID="reps-input"
              value={repsText}
              maxLength={3}
              selectTextOnFocus
              keyboardType="number-pad"
              returnKeyType="done"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              style={[
                inputStyle,
                focusedField === 'reps' ? { borderColor: colors.primary } : null,
                { paddingHorizontal: inputPadding },
              ]}
              onChangeText={setRepsText}
              onEndEditing={(e) => handleRepsEndEditing(e.nativeEvent.text)}
              onFocus={() => handleInputFocus('reps')}
              onBlur={handleInputBlur}
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </View>
      </View>

      <View
        style={[
          styles.rightCluster,
          { width: SET_ACTIONS_WIDTH, gap: SET_ACTIONS_GAP, marginLeft: SET_ROW_GAP },
        ]}
      >
        <Pressable
          onPress={onToggleComplete}
          style={({ pressed }) => [
            checkStyle,
            { width: buttonSize, height: buttonSize },
            pressed ? { opacity: 0.85 } : null,
          ]}
          accessibilityLabel="Toggle set complete"
        >
          <Ionicons
            name="checkmark"
            size={18}
            color={completed ? tokens.colors.onPrimary : tokens.colors.textSecondary}
          />
        </Pressable>

        <IconButton
          onPress={onDelete}
          size={buttonSize}
          accessibilityLabel="Delete set"
          variant="danger"
          icon={<Ionicons name="trash-outline" size={18} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  setLabel: {
    width: 32,
    alignItems: 'center',
    flexShrink: 0,
  },
  setNumberText: {
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  inputs: {
    flex: 1,
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
  },
  inputWrapper: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: tokens.radius.md,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: 0,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface2,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: 0,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.success,
    backgroundColor: tokens.colors.successSurface,
  },
  input: {
    width: '100%',
    minHeight: tokens.touchTargetMin,
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.surface,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  completedInput: {
    width: '100%',
    minHeight: tokens.touchTargetMin,
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.success,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.successSurface,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  check: {
    minHeight: tokens.touchTargetMin,
    minWidth: tokens.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: 'transparent',
  },
  checkCompleted: {
    minHeight: tokens.touchTargetMin,
    minWidth: tokens.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.success,
    backgroundColor: tokens.colors.success,
  },
});
