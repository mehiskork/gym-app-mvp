import React, { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import {
  Button,
  Card,
  EmptyState,
  IconChip,
  Input,
  ListRow,
  Screen,
  Snackbar,
  Text,
  DestructiveConfirmDialog,
} from '../ui';
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import {
  addPlannedSetToDayExercise,
  deleteDayExercise,
  deletePlannedSet,
  getDayById,
  listDayExercises,
  listPlannedSetsForDayExercise,
  renameDay,
  reorderDayExercises,
  updatePlannedSetTargets,
  type DayExerciseRow,
  type PlannedSetRow,
} from '../db/dayExerciseRepo';
import {
  createSessionFromPlanDay,
  getInProgressSession,
  getSessionById,
} from '../db/workoutSessionRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  MAX_SETS_PER_EXERCISE,
  WORKOUT_LIMIT_MESSAGES,
  isWorkoutLimitError,
} from '../db/workoutLimits';
import { EXERCISE_TYPE } from '../db/exerciseTypes';
import {
  formatRepsInputValue,
  formatWeightInputValue,
  parseRepsInput,
  parseWeightInput,
} from '../features/workoutSession/setInputParsing';
import {
  SET_INPUT_GAP,
  SET_NUMBER_COLUMN_WIDTH,
  SET_ROW_GAP,
} from '../features/workoutSession/setRowLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'DayDetail'>;

type PlannedSetRowEditorProps = {
  plannedSet: PlannedSetRow;
  canDelete: boolean;
  onCommitReps: (plannedSet: PlannedSetRow, value: string) => boolean;
  onCommitTargetWeight: (plannedSet: PlannedSetRow, value: string) => boolean;
  onDelete: (plannedSet: PlannedSetRow) => void;
};

type PlannedSetInputField = 'weight' | 'reps';

function renderPlannedSetHeader() {
  return (
    <View style={plannedSetStyles.headerRow}>
      <View style={[plannedSetStyles.leftCluster, { gap: SET_INPUT_GAP }]}>
        <View style={[plannedSetStyles.setColumn, { width: SET_NUMBER_COLUMN_WIDTH }]}>
          <Text
            variant="label"
            color={tokens.colors.mutedText}
            numberOfLines={1}
            ellipsizeMode="clip"
            style={plannedSetStyles.headerText}
          >
            SET
          </Text>
        </View>
        <View style={[plannedSetStyles.inputs, { gap: SET_INPUT_GAP }]}>
          <View style={plannedSetStyles.inputWrapper}>
            <Text
              variant="label"
              color={tokens.colors.mutedText}
              numberOfLines={1}
              style={plannedSetStyles.headerText}
            >
              WEIGHT
            </Text>
          </View>
          <View style={plannedSetStyles.inputWrapper}>
            <Text
              variant="label"
              color={tokens.colors.mutedText}
              numberOfLines={1}
              style={plannedSetStyles.headerText}
            >
              REPS
            </Text>
          </View>
        </View>
      </View>
      <View
        style={[
          plannedSetStyles.actionColumn,
          { width: tokens.touchTargetMin, marginLeft: SET_ROW_GAP },
        ]}
      />
    </View>
  );
}

function PlannedSetRowEditor({
  plannedSet,
  canDelete,
  onCommitReps,
  onCommitTargetWeight,
  onDelete,
}: PlannedSetRowEditorProps) {
  const repsInputRef = React.useRef<TextInput | null>(null);
  const { colors } = useAppTheme();
  const savedWeightText = formatWeightInputValue(plannedSet.target_weight);
  const savedRepsText = formatRepsInputValue(plannedSet.target_reps_min);
  const [weightText, setWeightText] = useState(savedWeightText);
  const [repsText, setRepsText] = useState(savedRepsText);
  const [focusedField, setFocusedField] = useState<PlannedSetInputField | null>(null);

  React.useEffect(() => {
    setWeightText(savedWeightText);
  }, [savedWeightText]);

  React.useEffect(() => {
    setRepsText(savedRepsText);
  }, [savedRepsText]);

  const commitWeight = useCallback(
    (value: string) => {
      const parsed = parseWeightInput(value);
      if (!parsed.ok) {
        setWeightText(savedWeightText);
        return;
      }

      const accepted = onCommitTargetWeight(plannedSet, value);
      setWeightText(accepted ? formatWeightInputValue(parsed.value) : savedWeightText);
    },
    [onCommitTargetWeight, plannedSet, savedWeightText],
  );

  const commitReps = useCallback(
    (value: string) => {
      const parsed = parseRepsInput(value);
      if (!parsed.ok) {
        setRepsText(savedRepsText);
        return;
      }

      const accepted = onCommitReps(plannedSet, value);
      setRepsText(accepted ? formatRepsInputValue(parsed.value) : savedRepsText);
    },
    [onCommitReps, plannedSet, savedRepsText],
  );

  return (
    <View style={plannedSetStyles.row}>
      <View style={[plannedSetStyles.leftCluster, { gap: SET_INPUT_GAP }]}>
        <View style={[plannedSetStyles.setColumn, { width: SET_NUMBER_COLUMN_WIDTH }]}>
          <Text
            testID="planned-set-number"
            variant="body"
            color={tokens.colors.mutedText}
            numberOfLines={1}
            ellipsizeMode="clip"
            style={plannedSetStyles.setNumberText}
          >
            {plannedSet.set_index}
          </Text>
        </View>
        <View style={[plannedSetStyles.inputs, { gap: SET_INPUT_GAP }]}>
          <View style={plannedSetStyles.inputWrapper}>
            <TextInput
              testID="planned-set-weight-input"
              value={weightText}
              onChangeText={setWeightText}
              onEndEditing={(event) => commitWeight(event.nativeEvent.text)}
              onFocus={() => setFocusedField('weight')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={() => repsInputRef.current?.focus()}
              keyboardType="decimal-pad"
              returnKeyType="next"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              maxLength={5}
              selectTextOnFocus
              style={[
                plannedSetStyles.input,
                focusedField === 'weight' ? { borderColor: colors.primary } : null,
              ]}
            />
          </View>
          <View style={plannedSetStyles.inputWrapper}>
            <TextInput
              ref={repsInputRef}
              testID="planned-set-reps-input"
              value={repsText}
              onChangeText={setRepsText}
              onEndEditing={(event) => commitReps(event.nativeEvent.text)}
              onFocus={() => setFocusedField('reps')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={Keyboard.dismiss}
              keyboardType="number-pad"
              returnKeyType="done"
              placeholder="0"
              placeholderTextColor={tokens.colors.textSecondary}
              maxLength={3}
              selectTextOnFocus
              style={[
                plannedSetStyles.input,
                focusedField === 'reps' ? { borderColor: colors.primary } : null,
              ]}
            />
          </View>
        </View>
      </View>
      <Pressable
        disabled={!canDelete}
        onPress={() => onDelete(plannedSet)}
        style={({ pressed }) => [
          plannedSetStyles.deleteButton,
          { marginLeft: SET_ROW_GAP },
          !canDelete ? { opacity: 0.45 } : null,
          pressed && canDelete ? { opacity: 0.85 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Delete planned set"
      >
        <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
      </Pressable>
    </View>
  );
}

export function DayDetailScreen({ route, navigation }: Props) {
  const { dayId, workoutPlanId, mode = 'edit' } = route.params;

  const minimalDragVisuals = true;
  const [dayNameInput, setDayNameInput] = useState<string>('');
  const [savedName, setSavedName] = useState<string>('');
  const [items, setItems] = useState<DayExerciseRow[]>([]);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [deleteExerciseTarget, setDeleteExerciseTarget] = useState<DayExerciseRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [plannedSetsByExerciseId, setPlannedSetsByExerciseId] = useState<
    Record<string, PlannedSetRow[]>
  >({});
  const { colors } = useAppTheme();

  const loadPlannedSets = useCallback((dayExerciseId: string) => {
    setPlannedSetsByExerciseId((prev) => ({
      ...prev,
      [dayExerciseId]: listPlannedSetsForDayExercise(dayExerciseId),
    }));
  }, []);

  const load = useCallback(() => {
    const day = getDayById(dayId);
    if (!day) {
      setDayNameInput('');
      setSavedName('');
      setItems([]);
      setExpandedExerciseId(null);
      setPlannedSetsByExerciseId({});
      return;
    }

    const input = day.name ?? '';
    setDayNameInput(input);
    setSavedName(input);

    setItems(listDayExercises(dayId));
    if (expandedExerciseId) loadPlannedSets(expandedExerciseId);
  }, [dayId, expandedExerciseId, loadPlannedSets]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: 'Session' });
    }, [navigation]),
  );

  const isStartSessionMode = mode === 'startSession';

  const handleStartWorkout = useCallback(() => {
    const existingSession = getInProgressSession();
    if (existingSession) {
      setStartNotice('Resume active workout');
      navigation.replace('WorkoutSession', { sessionId: existingSession.id });
      return;
    }

    if (!workoutPlanId) {
      setFeedback("Couldn't complete that action. Try again.");
      return;
    }

    const sessionId = createSessionFromPlanDay({ workoutPlanId, dayId });
    const createdSession = getSessionById(sessionId);
    if (!createdSession) {
      setFeedback("Couldn't complete that action. Try again.");
      return;
    }
    navigation.replace('WorkoutSession', { sessionId });
  }, [dayId, navigation, workoutPlanId]);

  const handleAddExercise = useCallback(() => {
    if (items.length >= MAX_EXERCISES_PER_SESSION) return;
    navigation.navigate('ExercisePicker', { dayId });
  }, [dayId, items.length, navigation]);

  const commitDayName = useCallback(() => {
    const next = dayNameInput.trim();
    const prev = savedName.trim();
    const nextDbValue = next.length === 0 ? null : next;

    if (next === prev) return;

    try {
      renameDay(dayId, nextDbValue);
      setSavedName(next);
    } catch {
      setFeedback("Couldn't save changes. Try again.");
      setDayNameInput(savedName);
    }
  }, [dayId, dayNameInput, savedName]);

  const confirmDeleteExercise = useCallback((row: DayExerciseRow) => {
    setDeleteExerciseTarget(row);
  }, []);

  const handleDeleteExercise = useCallback(() => {
    if (!deleteExerciseTarget) return;
    deleteDayExercise(deleteExerciseTarget.id);
    if (expandedExerciseId === deleteExerciseTarget.id) {
      setExpandedExerciseId(null);
    }
    setDeleteExerciseTarget(null);
    load();
  }, [deleteExerciseTarget, expandedExerciseId, load]);

  const handleToggleExerciseExpanded = useCallback(
    (item: DayExerciseRow) => {
      if (isStartSessionMode || item.exercise_type !== EXERCISE_TYPE.STRENGTH) {
        navigation.navigate('ExerciseDetail', { exerciseId: item.exercise_id });
        return;
      }

      setExpandedExerciseId((current) => {
        if (current === item.id) return null;
        loadPlannedSets(item.id);
        return item.id;
      });
    },
    [isStartSessionMode, loadPlannedSets, navigation],
  );

  const handleAddPlannedSet = useCallback(
    (dayExerciseId: string) => {
      try {
        addPlannedSetToDayExercise(dayExerciseId);
        loadPlannedSets(dayExerciseId);
      } catch (error) {
        setFeedback(
          isWorkoutLimitError(error) ? error.message : "Couldn't complete that action. Try again.",
        );
      }
    },
    [loadPlannedSets],
  );

  const handleDeletePlannedSet = useCallback(
    (plannedSet: PlannedSetRow) => {
      try {
        deletePlannedSet(plannedSet.id);
        loadPlannedSets(plannedSet.program_day_exercise_id);
      } catch {
        setFeedback("Couldn't complete that action. Try again.");
      }
    },
    [loadPlannedSets],
  );

  const handlePlannedSetRepsEndEditing = useCallback(
    (plannedSet: PlannedSetRow, value: string) => {
      const parsed = parseRepsInput(value);
      if (!parsed.ok) return false;

      updatePlannedSetTargets(plannedSet.id, { reps: parsed.value });
      loadPlannedSets(plannedSet.program_day_exercise_id);
      return true;
    },
    [loadPlannedSets],
  );

  const handlePlannedSetWeightEndEditing = useCallback(
    (plannedSet: PlannedSetRow, value: string) => {
      const parsed = parseWeightInput(value);
      if (!parsed.ok) return false;

      updatePlannedSetTargets(plannedSet.id, { targetWeight: parsed.value });
      loadPlannedSets(plannedSet.program_day_exercise_id);
      return true;
    },
    [loadPlannedSets],
  );

  const rowActionButtonStyle = {
    minHeight: tokens.touchTargetMin,
    minWidth: tokens.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  } as const;
  const exerciseLimitReached = items.length >= MAX_EXERCISES_PER_SESSION;

  const renderRowRight = useCallback(
    (item: DayExerciseRow, drag?: () => void, disabled = false) => {
      if (isStartSessionMode) return undefined;

      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
          <Pressable
            disabled={disabled}
            onPress={() => confirmDeleteExercise(item)}
            style={({ pressed }) => [rowActionButtonStyle, pressed ? { opacity: 0.85 } : null]}
            accessibilityLabel="Delete exercise"
          >
            <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
          </Pressable>
          <Pressable
            disabled={disabled}
            onLongPress={drag}
            delayLongPress={150}
            style={({ pressed }) => [rowActionButtonStyle, pressed ? { opacity: 0.85 } : null]}
            accessibilityLabel="Reorder exercise"
          >
            <Ionicons name="reorder-three-outline" size={18} color={tokens.colors.mutedText} />
          </Pressable>
        </View>
      );
    },
    [confirmDeleteExercise, isStartSessionMode],
  );

  const renderPlannedSets = useCallback(
    (item: DayExerciseRow) => {
      if (expandedExerciseId !== item.id || item.exercise_type !== EXERCISE_TYPE.STRENGTH) {
        return null;
      }

      const plannedSets = plannedSetsByExerciseId[item.id] ?? [];
      const setLimitReached = plannedSets.length >= MAX_SETS_PER_EXERCISE;
      const canDelete = plannedSets.length > 1;

      return (
        <View
          style={{
            gap: tokens.spacing.sm,
            padding: tokens.spacing.md,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: tokens.colors.border,
            borderBottomLeftRadius: tokens.radius.md,
            borderBottomRightRadius: tokens.radius.md,
            backgroundColor: tokens.colors.surface,
          }}
        >
          {renderPlannedSetHeader()}
          {plannedSets.map((plannedSet) => (
            <PlannedSetRowEditor
              key={plannedSet.id}
              plannedSet={plannedSet}
              canDelete={canDelete}
              onCommitReps={handlePlannedSetRepsEndEditing}
              onCommitTargetWeight={handlePlannedSetWeightEndEditing}
              onDelete={handleDeletePlannedSet}
            />
          ))}

          <Button
            title={setLimitReached ? WORKOUT_LIMIT_MESSAGES.maxSetsPerExercise : 'Add set'}
            variant="secondary"
            disabled={setLimitReached}
            onPress={() => handleAddPlannedSet(item.id)}
          />
        </View>
      );
    },
    [
      expandedExerciseId,
      handleAddPlannedSet,
      handleDeletePlannedSet,
      handlePlannedSetRepsEndEditing,
      handlePlannedSetWeightEndEditing,
      plannedSetsByExerciseId,
    ],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DayExerciseRow>) => {
      const isStrengthEditable =
        !isStartSessionMode && item.exercise_type === EXERCISE_TYPE.STRENGTH;
      const expanded = expandedExerciseId === item.id;

      return (
        <View>
          <ListRow
            title={item.exercise_name}
            subtitle={
              isStartSessionMode
                ? 'View exercise'
                : isStrengthEditable
                  ? expanded
                    ? 'Hide planned sets'
                    : 'Edit planned sets'
                  : 'Tap to view'
            }
            left={
              <IconChip variant="primarySoft" size={40}>
                <Ionicons name="barbell-outline" size={18} color={colors.primary} />
              </IconChip>
            }
            onPress={() => handleToggleExerciseExpanded(item)}
            showChevron
            right={renderRowRight(item, drag)}
            style={[
              isActive && !minimalDragVisuals
                ? {
                    backgroundColor: tokens.colors.surface2,
                    borderColor: tokens.colors.primary,
                  }
                : undefined,
              expanded
                ? {
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                  }
                : undefined,
            ]}
          />
          {renderPlannedSets(item)}
        </View>
      );
    },
    [
      colors.primary,
      expandedExerciseId,
      handleToggleExerciseExpanded,
      isStartSessionMode,
      minimalDragVisuals,
      renderPlannedSets,
      renderRowRight,
    ],
  );

  const renderPlaceholder = useCallback(
    ({ item }: { item: DayExerciseRow; index: number }) => (
      <ListRow
        title={item.exercise_name}
        subtitle={isStartSessionMode ? 'View exercise' : 'Tap to view'}
        left={
          <IconChip variant="primarySoft" size={40}>
            <Ionicons name="barbell-outline" size={18} color={colors.primary} />
          </IconChip>
        }
        right={renderRowRight(item, undefined, true)}
        showChevron
        style={minimalDragVisuals ? undefined : { opacity: 0.45 }}
      />
    ),
    [colors.primary, isStartSessionMode, minimalDragVisuals, renderRowRight],
  );

  const header = (
    <View style={{ marginBottom: tokens.spacing.md }}>
      <Card>
        <View style={{ gap: tokens.spacing.md }}>
          <View style={{ gap: tokens.spacing.xs }}>
            <Input
              label="Session name"
              maxLength={50}
              value={dayNameInput}
              onChangeText={setDayNameInput}
              placeholder="e.g., Push"
              returnKeyType="done"
              onSubmitEditing={commitDayName}
              onEndEditing={commitDayName}
            />
          </View>
          <Text variant="muted">
            {items.length} exercise{items.length === 1 ? '' : 's'}
          </Text>
          {isStartSessionMode ? (
            <Button title="Start workout" onPress={handleStartWorkout} />
          ) : (
            <>
              <Button
                title={exerciseLimitReached ? 'Max 50 exercises' : 'Add exercise'}
                disabled={exerciseLimitReached}
                onPress={handleAddExercise}
              />
              <Text variant="muted">Hold the reorder handle to move exercises.</Text>
            </>
          )}
          {isStartSessionMode && startNotice ? <Text variant="muted">{startNotice}</Text> : null}
        </View>
      </Card>
    </View>
  );

  const emptyState = (
    <Card>
      <EmptyState
        icon={<Ionicons name="barbell-outline" size={24} color={colors.primary} />}
        title="No exercises yet"
        description="Add your first exercise to start logging."
        action={
          isStartSessionMode ? (
            <Button title="Start workout" variant="secondary" onPress={handleStartWorkout} />
          ) : (
            <Button
              title={exerciseLimitReached ? 'Max 50 exercises' : 'Add exercise'}
              variant="secondary"
              disabled={exerciseLimitReached}
              onPress={handleAddExercise}
            />
          )
        }
      />
    </Card>
  );

  if (items.length === 0) {
    return (
      <Screen padded={false} bottomInset="none" scroll>
        <View
          style={{
            padding: tokens.spacing.lg,
            paddingBottom: tokens.spacing.xl,
            gap: tokens.spacing.sm,
          }}
        >
          {header}
          {emptyState}
        </View>
        <DestructiveConfirmDialog
          visible={deleteExerciseTarget !== null}
          title="Delete exercise?"
          body={`"${deleteExerciseTarget?.exercise_name ?? 'This exercise'}" will be removed from this session.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onClose={() => setDeleteExerciseTarget(null)}
          onConfirm={handleDeleteExercise}
        />
        <Snackbar
          visible={feedback !== null}
          message={feedback ?? ''}
          variant="error"
          onDismiss={() => setFeedback(null)}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} bottomInset="none" style={{ flex: 1 }}>
      <DraggableFlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        renderPlaceholder={renderPlaceholder}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        contentContainerStyle={{
          padding: tokens.spacing.lg,
          paddingBottom: tokens.spacing.xl,
        }}
        animationConfig={{
          damping: 30,
          mass: 0.35,
          stiffness: 220,
          overshootClamping: true,
          energyThreshold: 1e-8,
        }}
        onDragBegin={
          isStartSessionMode
            ? undefined
            : () => {
                void Haptics.selectionAsync();
              }
        }
        onDragEnd={
          isStartSessionMode
            ? undefined
            : ({ data }) => {
                setItems(data);
                reorderDayExercises(
                  dayId,
                  data.map((x) => x.id),
                );
              }
        }
        keyboardShouldPersistTaps="handled"
      />
      <DestructiveConfirmDialog
        visible={deleteExerciseTarget !== null}
        title="Delete exercise?"
        body={`"${deleteExerciseTarget?.exercise_name ?? 'This exercise'}" will be removed from this session.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeleteExerciseTarget(null)}
        onConfirm={handleDeleteExercise}
      />
      <Snackbar
        visible={feedback !== null}
        message={feedback ?? ''}
        variant="error"
        onDismiss={() => setFeedback(null)}
      />
    </Screen>
  );
}

const plannedSetStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  setColumn: {
    alignItems: 'center',
    flexShrink: 0,
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
  headerText: {
    fontSize: tokens.typography.caption.fontSize,
    textAlign: 'center',
  },
  actionColumn: {
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
  setNumberText: {
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
    textAlign: 'center',
    includeFontPadding: false,
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
  deleteButton: {
    minWidth: tokens.touchTargetMin,
    minHeight: tokens.touchTargetMin,
    width: tokens.touchTargetMin,
    height: tokens.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    flexShrink: 0,
  },
});
