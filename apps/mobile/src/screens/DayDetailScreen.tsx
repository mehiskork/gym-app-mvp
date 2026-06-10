import React, { useCallback, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import {
  Button,
  BottomSheetModal,
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
  updateDayExerciseNote,
  updatePlannedCardioTarget,
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
import { EXERCISE_TYPE, type CardioSummary } from '../db/exerciseTypes';
import {
  formatRepsInputValue,
  formatWeightInputValue,
  parseRepsInput,
  parseWeightInput,
} from '../features/workoutSession/setInputParsing';
import {
  cardioFieldMaxLengths,
  fieldsForCardioProfile,
  formatCardioInputValue,
  parseCardioInput,
} from '../features/workoutSession/cardioInputParsing';
import {
  SET_INPUT_GAP,
  SET_NUMBER_COLUMN_WIDTH,
  SET_ROW_GAP,
} from '../features/workoutSession/setRowLayout';
import { useKeyboardAvoidance } from '../features/workoutSession/useKeyboardAvoidance';

type Props = NativeStackScreenProps<RootStackParamList, 'DayDetail'>;
const MAX_PLAN_NOTE_LENGTH = 200;

type PlannedSetRowEditorProps = {
  plannedSet: PlannedSetRow;
  canDelete: boolean;
  onCommitReps: (plannedSet: PlannedSetRow, value: string) => boolean;
  onCommitTargetWeight: (plannedSet: PlannedSetRow, value: string) => boolean;
  onDelete: (plannedSet: PlannedSetRow) => void;
  onEditFocus?: (metrics: { pageY: number; height: number }) => void;
};

type PlannedSetInputField = 'weight' | 'reps';

type PlannedCardioTargetEditorProps = {
  exercise: DayExerciseRow;
  onCommitField: (exercise: DayExerciseRow, field: keyof CardioSummary, value: string) => boolean;
  onEditFocus?: (metrics: { pageY: number; height: number }) => void;
};

function getPlannedCardioSummary(exercise: DayExerciseRow): CardioSummary {
  return {
    duration_minutes: exercise.planned_cardio_duration_minutes ?? null,
    distance_km: exercise.planned_cardio_distance_km ?? null,
    speed_kph: exercise.planned_cardio_speed_kph ?? null,
    incline_percent: exercise.planned_cardio_incline_percent ?? null,
    resistance_level: exercise.planned_cardio_resistance_level ?? null,
    pace_seconds_per_km: exercise.planned_cardio_pace_seconds_per_km ?? null,
    floors: exercise.planned_cardio_floors ?? null,
    stair_level: exercise.planned_cardio_stair_level ?? null,
  };
}

function PlannedCardioTargetEditor({
  exercise,
  onCommitField,
  onEditFocus,
}: PlannedCardioTargetEditorProps) {
  const fields = React.useMemo(
    () => fieldsForCardioProfile(exercise.cardio_profile),
    [exercise.cardio_profile],
  );
  const fieldRefs = React.useRef<Partial<Record<keyof CardioSummary, View | null>>>({});
  const savedTexts = React.useMemo(() => {
    const summary = getPlannedCardioSummary(exercise);
    return Object.fromEntries(
      (Object.keys(summary) as Array<keyof CardioSummary>).map((field) => [
        field,
        formatCardioInputValue(field, summary[field]),
      ]),
    ) as Record<keyof CardioSummary, string>;
  }, [
    exercise.planned_cardio_duration_minutes,
    exercise.planned_cardio_distance_km,
    exercise.planned_cardio_speed_kph,
    exercise.planned_cardio_incline_percent,
    exercise.planned_cardio_resistance_level,
    exercise.planned_cardio_pace_seconds_per_km,
    exercise.planned_cardio_floors,
    exercise.planned_cardio_stair_level,
  ]);
  const [fieldTexts, setFieldTexts] = useState(savedTexts);
  const currentExerciseIdRef = React.useRef(exercise.id);
  const focusedFieldRef = React.useRef<keyof CardioSummary | null>(null);
  const dirtyFieldsRef = React.useRef<Set<keyof CardioSummary>>(new Set());

  React.useEffect(() => {
    setFieldTexts((current) => {
      currentExerciseIdRef.current ??= exercise.id;
      const exerciseChanged = currentExerciseIdRef.current !== exercise.id;
      if (exerciseChanged) {
        currentExerciseIdRef.current = exercise.id;
        dirtyFieldsRef.current ??= new Set();
        dirtyFieldsRef.current.clear();
        focusedFieldRef.current = null;
        return savedTexts;
      }

      let changed = false;
      const next = { ...current };
      dirtyFieldsRef.current ??= new Set();
      for (const field of Object.keys(savedTexts) as Array<keyof CardioSummary>) {
        if (dirtyFieldsRef.current.has(field) || focusedFieldRef.current === field) continue;
        if (next[field] === savedTexts[field]) continue;
        next[field] = savedTexts[field];
        changed = true;
      }
      return changed ? next : current;
    });
  }, [exercise.id, savedTexts]);

  const rows = React.useMemo(
    () =>
      fields.reduce<Array<Array<{ key: keyof CardioSummary; label: string }>>>(
        (acc, field, index) => {
          const rowIndex = Math.floor(index / 2);
          if (!acc[rowIndex]) acc[rowIndex] = [];
          acc[rowIndex].push(field);
          return acc;
        },
        [],
      ),
    [fields],
  );

  const handleEndEditing = useCallback(
    (field: keyof CardioSummary, value: string) => {
      const parsed = parseCardioInput(field, value);
      if (!parsed.ok) {
        dirtyFieldsRef.current ??= new Set();
        dirtyFieldsRef.current.delete(field);
        focusedFieldRef.current = null;
        setFieldTexts((current) => ({ ...current, [field]: savedTexts[field] }));
        return;
      }

      const accepted = onCommitField(exercise, field, value);
      dirtyFieldsRef.current ??= new Set();
      dirtyFieldsRef.current.delete(field);
      focusedFieldRef.current = null;
      setFieldTexts((current) => ({
        ...current,
        [field]: accepted ? formatCardioInputValue(field, parsed.value) : savedTexts[field],
      }));
    },
    [exercise, onCommitField, savedTexts],
  );

  const handleFieldFocus = useCallback(
    (field: keyof CardioSummary) => {
      focusedFieldRef.current = field;
      if (!onEditFocus) return;
      const fieldRef = fieldRefs.current[field];
      if (!fieldRef) return;
      fieldRef.measureInWindow((_x, pageY, _width, height) => {
        onEditFocus({ pageY, height });
      });
    },
    [onEditFocus],
  );

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {rows.map((row, rowIndex) => (
        <View
          key={`cardio-row-${rowIndex}`}
          style={{ flexDirection: 'row', gap: tokens.spacing.sm }}
        >
          {row.map((field) => (
            <View
              key={field.key}
              ref={(node) => {
                fieldRefs.current[field.key] = node;
              }}
              style={{ flex: 1 }}
            >
              <Input
                label={field.label}
                maxLength={cardioFieldMaxLengths[field.key]}
                value={fieldTexts[field.key]}
                keyboardType={field.key === 'pace_seconds_per_km' ? 'number-pad' : 'decimal-pad'}
                placeholder={field.key === 'pace_seconds_per_km' ? '5:30' : undefined}
                helperText={field.key === 'pace_seconds_per_km' ? 'Type 530 for 5:30' : undefined}
                inputStyle={plannedCardioStyles.input}
                onFocus={() => handleFieldFocus(field.key)}
                onChangeText={(value) => {
                  dirtyFieldsRef.current ??= new Set();
                  dirtyFieldsRef.current.add(field.key);
                  setFieldTexts((current) =>
                    current[field.key] === value ? current : { ...current, [field.key]: value },
                  );
                }}
                onEndEditing={(event) => handleEndEditing(field.key, event.nativeEvent.text)}
              />
            </View>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

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
  onEditFocus,
}: PlannedSetRowEditorProps) {
  const rowRef = React.useRef<View | null>(null);
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

  const handleEditFocus = React.useCallback(() => {
    if (!onEditFocus || !rowRef.current) return;
    rowRef.current.measureInWindow((_x, pageY, _width, height) => {
      onEditFocus({ pageY, height });
    });
  }, [onEditFocus]);

  const handleInputFocus = React.useCallback(
    (field: PlannedSetInputField) => {
      setFocusedField(field);
      handleEditFocus();
    },
    [handleEditFocus],
  );

  return (
    <View ref={rowRef} style={plannedSetStyles.row}>
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
              onFocus={() => handleInputFocus('weight')}
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
              onFocus={() => handleInputFocus('reps')}
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
  const [noteEditorExerciseId, setNoteEditorExerciseId] = useState<string | null>(null);
  const [planNoteDraft, setPlanNoteDraft] = useState('');
  const [plannedSetsByExerciseId, setPlannedSetsByExerciseId] = useState<
    Record<string, PlannedSetRow[]>
  >({});
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { flatListRef, handleScrollOffsetChange, handleEditFocus, keyboardSpacer } =
    useKeyboardAvoidance<DayExerciseRow>({ bottomInset: insets.bottom });

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
      if (isStartSessionMode) {
        navigation.navigate('ExerciseDetail', { exerciseId: item.exercise_id });
        return;
      }

      setExpandedExerciseId((current) => {
        if (current === item.id) return null;
        if (item.exercise_type === EXERCISE_TYPE.STRENGTH) loadPlannedSets(item.id);
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

  const handlePlannedCardioTargetEndEditing = useCallback(
    (exercise: DayExerciseRow, field: keyof CardioSummary, value: string) => {
      const parsed = parseCardioInput(field, value);
      if (!parsed.ok) return false;

      updatePlannedCardioTarget(exercise.id, { [field]: parsed.value });
      load();
      return true;
    },
    [load],
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

  const renderExerciseEditor = useCallback(
    (item: DayExerciseRow) => {
      if (expandedExerciseId !== item.id) {
        return null;
      }

      const plannedSets = plannedSetsByExerciseId[item.id] ?? [];
      const setLimitReached = plannedSets.length >= MAX_SETS_PER_EXERCISE;
      const canDelete = plannedSets.length > 1;
      const noteButtonTitle = item.notes?.trim() ? 'View Note' : 'Add Note';

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
          {item.exercise_type === EXERCISE_TYPE.STRENGTH ? (
            <>
              {renderPlannedSetHeader()}
              {plannedSets.map((plannedSet) => (
                <PlannedSetRowEditor
                  key={plannedSet.id}
                  plannedSet={plannedSet}
                  canDelete={canDelete}
                  onCommitReps={handlePlannedSetRepsEndEditing}
                  onCommitTargetWeight={handlePlannedSetWeightEndEditing}
                  onDelete={handleDeletePlannedSet}
                  onEditFocus={handleEditFocus}
                />
              ))}

              <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
                <Button
                  title={noteButtonTitle}
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setNoteEditorExerciseId(item.id);
                    setPlanNoteDraft(item.notes ?? '');
                  }}
                />
                <Button
                  title={setLimitReached ? WORKOUT_LIMIT_MESSAGES.maxSetsPerExercise : 'Add Set'}
                  variant="secondary"
                  disabled={setLimitReached}
                  style={{ flex: 1 }}
                  onPress={() => handleAddPlannedSet(item.id)}
                />
              </View>
            </>
          ) : (
            <>
              <PlannedCardioTargetEditor
                exercise={item}
                onCommitField={handlePlannedCardioTargetEndEditing}
                onEditFocus={handleEditFocus}
              />
              <Button
                title={noteButtonTitle}
                variant="secondary"
                onPress={() => {
                  setNoteEditorExerciseId(item.id);
                  setPlanNoteDraft(item.notes ?? '');
                }}
              />
            </>
          )}
        </View>
      );
    },
    [
      expandedExerciseId,
      handleAddPlannedSet,
      handleDeletePlannedSet,
      handlePlannedSetRepsEndEditing,
      handlePlannedSetWeightEndEditing,
      handlePlannedCardioTargetEndEditing,
      plannedSetsByExerciseId,
    ],
  );

  const noteEditingExercise = items.find((item) => item.id === noteEditorExerciseId) ?? null;

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DayExerciseRow>) => {
      const isStrengthEditable =
        !isStartSessionMode && item.exercise_type === EXERCISE_TYPE.STRENGTH;
      const isCardioEditable = !isStartSessionMode && item.exercise_type === EXERCISE_TYPE.CARDIO;
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
                  : isCardioEditable
                    ? expanded
                      ? 'Hide cardio targets'
                      : 'Edit cardio targets'
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
          {renderExerciseEditor(item)}
        </View>
      );
    },
    [
      colors.primary,
      expandedExerciseId,
      handleToggleExerciseExpanded,
      isStartSessionMode,
      minimalDragVisuals,
      renderExerciseEditor,
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <DraggableFlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          renderPlaceholder={renderPlaceholder}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
          contentContainerStyle={{
            padding: tokens.spacing.lg,
            paddingBottom: tokens.spacing.xl + keyboardSpacer,
          }}
          animationConfig={{
            damping: 30,
            mass: 0.35,
            stiffness: 220,
            overshootClamping: true,
            energyThreshold: 1e-8,
          }}
          onScrollOffsetChange={handleScrollOffsetChange}
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
      </KeyboardAvoidingView>
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
      <BottomSheetModal
        visible={Boolean(noteEditingExercise)}
        title={noteEditingExercise ? `${noteEditingExercise.exercise_name} Note` : 'Exercise Note'}
        keyboardAware
        actions={
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
            <Button
              title="Clear"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                if (!noteEditingExercise) return;
                updateDayExerciseNote(noteEditingExercise.id, null);
                setNoteEditorExerciseId(null);
                setPlanNoteDraft('');
                load();
              }}
            />
            <Button
              title="Save"
              variant="primary"
              style={{ flex: 1 }}
              onPress={() => {
                if (!noteEditingExercise) return;
                updateDayExerciseNote(noteEditingExercise.id, planNoteDraft);
                setNoteEditorExerciseId(null);
                setPlanNoteDraft('');
                load();
              }}
            />
          </View>
        }
        onClose={() => {
          setNoteEditorExerciseId(null);
          setPlanNoteDraft('');
        }}
      >
        <Input
          value={planNoteDraft}
          onChangeText={(value) => setPlanNoteDraft(value.slice(0, MAX_PLAN_NOTE_LENGTH))}
          placeholder="Add a Plan Note"
          maxLength={MAX_PLAN_NOTE_LENGTH}
          multiline
          textAlignVertical="top"
          inputStyle={{ minHeight: 90, paddingVertical: tokens.spacing.sm }}
          helperText={`${planNoteDraft.length}/${MAX_PLAN_NOTE_LENGTH}`}
        />
      </BottomSheetModal>
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

const plannedCardioStyles = StyleSheet.create({
  input: {
    fontSize: tokens.typography.subtitle.fontSize + 2,
    fontWeight: tokens.typography.subtitle.fontWeight,
    lineHeight: tokens.typography.subtitle.fontSize + 6,
  },
});
