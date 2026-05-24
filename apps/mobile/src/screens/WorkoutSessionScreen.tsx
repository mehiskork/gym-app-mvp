import React, { useCallback, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import {
  BottomSheetModal,
  Button,
  Card,
  EmptyState,
  IconButton,
  IconChip,
  Input,
  Screen,
  Snackbar,
  Text,
} from '../ui';
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import { completeSession, updateWorkoutSessionNote } from '../db/workoutSessionRepo';
import { MAX_EXERCISES_PER_SESSION, MAX_SETS_PER_EXERCISE } from '../db/workoutLimits';
import {
  clearRestTimer,
  getWorkoutLoggerData,
  updateWorkoutSessionExerciseComment,
  updateWorkoutSessionExerciseCardioSummary,
  type LoggerExercise,
  type LoggerSession,
} from '../db/workoutLoggerRepo';
import { EXERCISE_TYPE, type CardioProfile, type CardioSummary } from '../db/exerciseTypes';
import { formatRestCountdown } from '../utils/format';
import { CardioSummaryEditor } from '../features/workoutSession/CardioSummaryEditor';
import { ExerciseCard } from '../features/workoutSession/ExerciseCard';
import { SetRow } from '../features/workoutSession/SetRow';
import { FinishWorkoutSheet } from '../features/workoutSession/FinishWorkoutSheet';
import { useKeyboardAvoidance } from '../features/workoutSession/useKeyboardAvoidance';
import { useRestTimer } from '../features/workoutSession/useRestTimer';
import { useSessionTick } from '../features/workoutSession/useSessionTick';
import { useWorkoutSetActions } from '../features/workoutSession/useWorkoutSetActions';
import { useWorkoutKeepAwake } from '../features/workoutSession/useWorkoutKeepAwake';
import { useWorkoutSessionNavGuard } from '../features/workoutSession/useWorkoutSessionNavGuard';
import { getSettings } from '../db/settingsRepo';
import { cancelRestTimerNotification } from '../utils/restTimerNotifications';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

const REST_TIMER_HEIGHT = tokens.touchTargetMin + tokens.spacing.xl;
const REST_TIMER_TOP_OFFSET = tokens.spacing.xs;
const REST_TIMER_CONTENT_GAP = tokens.spacing.sm;
const CTA_HEIGHT = tokens.touchTargetMin + tokens.spacing.sm;
const CTA_STACK_GAP = tokens.spacing.sm;
const MAX_EXERCISE_COMMENT_LENGTH = 200;
const MAX_WORKOUT_NOTE_LENGTH = 200;

function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function getExerciseSubtitle(exercise: LoggerExercise): string | null {
  if (exercise.exercise_type === EXERCISE_TYPE.CARDIO) return null;
  if (exercise.sets.length === 0) return null;
  const completed = exercise.sets.filter((set) => set.is_completed === 1).length;
  return `${completed}/${exercise.sets.length} sets complete`;
}

const cardioDisplayNames: Record<CardioProfile, string> = {
  treadmill: 'Treadmill',
  bike: 'Bike',
  ergometer: 'Ergometer',
  stairs: 'Stairs',
  elliptical: 'Elliptical',
};

function getExerciseDisplayName(exercise: LoggerExercise): string {
  if (exercise.exercise_type === EXERCISE_TYPE.CARDIO && exercise.cardio_profile) {
    return cardioDisplayNames[exercise.cardio_profile];
  }
  return exercise.exercise_name;
}

function parseCardioNumber(field: keyof CardioSummary, input: string): number | null {
  const value = parseNumber(input);
  if (value === null) return null;
  if (field === 'duration_minutes') return Math.max(0, Math.floor(value));
  if (field === 'floors') return Math.max(0, Math.floor(value));
  return value;
}

export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const isFocused = useIsFocused();
  const [session, setSession] = useState<LoggerSession | null>(null);
  const [exercises, setExercises] = useState<LoggerExercise[]>([]);
  const { tick, durationMinutes } = useSessionTick(session?.started_at);
  const [settings, setSettings] = useState(getSettings());

  const [finishOpen, setFinishOpen] = useState(false);
  const { colors } = useAppTheme();
  const [isFinishing, setIsFinishing] = useState(false);
  const insets = useSafeAreaInsets();
  const { scrollViewRef, handleScroll, handleEditFocus, keyboardOpen, keyboardSpacer } =
    useKeyboardAvoidance({ bottomInset: insets.bottom });
  const [commentEditorExerciseId, setCommentEditorExerciseId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [workoutNoteDraft, setWorkoutNoteDraft] = useState('');
  const { resetToHome } = useWorkoutSessionNavGuard({ navigation });
  const { timerActive, remainingSeconds, clearRestTimerHandler } = useRestTimer({
    session,
    sessionId,
    tick,
    vibrationEnabled: settings.restTimerVibration,
    setSession,
  });
  const load = useCallback(() => {
    const data = getWorkoutLoggerData(sessionId);
    if (!data) {
      setSession(null);
      setExercises([]);
      resetToHome();
      return;
    }
    setSession(data.session);
    setExercises(data.exercises);
    setWorkoutNoteDraft(data.session.workout_note ?? '');
  }, [resetToHome, sessionId]);

  const setActions = useWorkoutSetActions({
    sessionId,
    restTimerSettings: {
      autoStartRestTimer: settings.autoStartRestTimer,
      defaultRestSeconds: settings.defaultRestSeconds,
      restTimerNotifications: settings.restTimerNotifications,
      restTimerVibration: settings.restTimerVibration,
    },
    load,
  });

  useFocusEffect(
    useCallback(() => {
      load();
      setSettings(getSettings());
    }, [load]),
  );

  useWorkoutKeepAwake({
    isFocused,
    keepScreenOn: settings.keepScreenOn,
    sessionStatus: session?.status,
  });

  useFocusEffect(
    useCallback(() => {
      if (session?.title) navigation.setOptions({ title: session.title });
    }, [navigation, session?.title]),
  );

  const totals = useMemo(() => {
    const totalSets = exercises.reduce(
      (sum, exercise) =>
        sum + (exercise.exercise_type === EXERCISE_TYPE.STRENGTH ? exercise.sets.length : 0),
      0,
    );
    const completedSets = exercises.reduce(
      (sum, exercise) =>
        sum +
        (exercise.exercise_type === EXERCISE_TYPE.STRENGTH
          ? exercise.sets.filter((set) => set.is_completed === 1).length
          : 0),
      0,
    );
    return { totalSets, completedSets };
  }, [exercises]);

  const handleFinish = useCallback(() => {
    setIsFinishing(true);
    setFinishOpen(false);
    try {
      completeSession(sessionId, workoutNoteDraft);
      clearRestTimer(sessionId);
      void cancelRestTimerNotification();
      load();
      resetToHome();
    } finally {
      setIsFinishing(false);
    }
  }, [load, resetToHome, sessionId, workoutNoteDraft]);

  const handleCloseFinish = useCallback(() => {
    if (isFinishing) return;
    setFinishOpen(false);
  }, [isFinishing]);

  const handleAddExercise = useCallback(() => {
    if (exercises.length >= MAX_EXERCISES_PER_SESSION) return;
    navigation.navigate('ExercisePicker', {
      addToSessionId: sessionId,
    });
  }, [exercises.length, navigation, sessionId]);

  const handleWorkoutNoteChange = useCallback(
    (value: string) => {
      const normalized = value.slice(0, MAX_WORKOUT_NOTE_LENGTH);
      setWorkoutNoteDraft(normalized);
      if (session?.status !== 'in_progress') return;
      updateWorkoutSessionNote(sessionId, normalized);
    },
    [session?.status, sessionId],
  );

  const editingExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === commentEditorExerciseId) ?? null,
    [commentEditorExerciseId, exercises],
  );

  const footerPaddingBottom = Math.max(insets.bottom, tokens.spacing.sm);
  const footerPaddingTop = tokens.spacing.sm;
  const footerHeight = CTA_HEIGHT + footerPaddingTop + footerPaddingBottom;
  const footerOverlapHeight = Math.max(footerHeight - insets.bottom, CTA_HEIGHT);
  const bottomStackHeight =
    footerOverlapHeight + (setActions.snackbarUndo.visible ? CTA_HEIGHT + CTA_STACK_GAP : 0);
  const bottomStackOffset = -insets.bottom;
  const baseScrollPaddingTop = tokens.spacing.md;
  const scrollPaddingTop = timerActive
    ? REST_TIMER_TOP_OFFSET + REST_TIMER_HEIGHT + REST_TIMER_CONTENT_GAP
    : baseScrollPaddingTop;
  const restTimerTop = REST_TIMER_TOP_OFFSET;
  if (!session) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Text variant="title">Loading…</Text>
      </Screen>
    );
  }
  const canEditComment = session.status === 'in_progress';
  const exerciseLimitReached = exercises.length >= MAX_EXERCISES_PER_SESSION;

  return (
    <Screen padded={false} bottomInset="none" contentStyle={{ paddingTop: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: scrollPaddingTop,
            paddingBottom: bottomStackHeight + keyboardSpacer + tokens.spacing.lg,
            gap: tokens.spacing.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          {exercises.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Ionicons name="barbell-outline" size={24} color={colors.primary} />}
                title="No exercises yet"
                description="Add exercises to start logging your sets."
                action={
                  <Button
                    title="Add exercise"
                    variant="secondary"
                    disabled={session.status !== 'in_progress'}
                    onPress={handleAddExercise}
                  />
                }
              />
            </Card>
          ) : (
            exercises.map((ex) => {
              return (
                <ExerciseCard
                  key={ex.id}
                  name={getExerciseDisplayName(ex)}
                  subtitle={getExerciseSubtitle(ex)}
                  commentButtonLabel={ex.notes?.trim() ? 'View comment' : 'Add comment'}
                  onCommentPress={() => {
                    setCommentEditorExerciseId(ex.id);
                    setCommentDraft(ex.notes ?? '');
                  }}
                  onPressTitle={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: ex.exercise_id })
                  }
                  showAddSet={ex.exercise_type === EXERCISE_TYPE.STRENGTH}
                  addSetDisabled={ex.sets.length >= MAX_SETS_PER_EXERCISE}
                  showSetHeaders={ex.exercise_type === EXERCISE_TYPE.STRENGTH}
                  onAddSet={() => {
                    if (ex.exercise_type !== EXERCISE_TYPE.STRENGTH) return;
                    setActions.handleAddSet(ex);
                  }}
                  onSwap={() =>
                    navigation.navigate('ExercisePicker', {
                      swapSessionExerciseId: ex.id,
                      swapSessionId: sessionId,
                    })
                  }
                >
                  {ex.exercise_type === EXERCISE_TYPE.CARDIO ? (
                    <CardioSummaryEditor
                      profile={ex.cardio_profile}
                      summary={ex.cardio_summary}
                      editable={session.status === 'in_progress'}
                      onEditFocus={handleEditFocus}
                      onFieldEndEditing={(field, value) => {
                        updateWorkoutSessionExerciseCardioSummary(ex.id, {
                          [field]: parseCardioNumber(field, value),
                        });
                        load();
                      }}
                    />
                  ) : (
                    ex.sets.map((set) => (
                      <SetRow
                        key={set.id}
                        set={set}
                        onWeightEndEditing={(value) =>
                          setActions.handleWeightEndEditing(set, value)
                        }
                        onRepsEndEditing={(value) => setActions.handleRepsEndEditing(set, value)}
                        onToggleComplete={() => {
                          Keyboard.dismiss();
                          setActions.handleToggleComplete(ex, set);
                        }}
                        onDelete={() => setActions.handleDeleteSet(set)}
                        onEditFocus={handleEditFocus}
                      />
                    ))
                  )}
                </ExerciseCard>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {timerActive ? (
        <Card
          style={{
            position: 'absolute',
            top: restTimerTop,
            left: tokens.spacing.lg,
            right: tokens.spacing.lg,
            zIndex: 50,
            elevation: 50,
            paddingVertical: tokens.spacing.sm,
            paddingHorizontal: tokens.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
            <IconChip variant="primarySoft" size={40}>
              <Ionicons name="timer-outline" size={20} color={tokens.colors.primary} />
            </IconChip>
            <View style={{ flex: 1 }}>
              <Text
                variant="mono"
                style={{
                  fontSize: tokens.typography.title.fontSize,
                  fontWeight: tokens.typography.title.fontWeight,
                }}
              >
                {formatRestCountdown(remainingSeconds)}
              </Text>
            </View>
            <IconButton
              onPress={clearRestTimerHandler}
              accessibilityLabel="Clear rest timer"
              variant="danger"
              icon={<Ionicons name="trash-outline" size={18} />}
            />
          </View>
        </Card>
      ) : null}
      {keyboardOpen ? null : (
        <View
          style={{
            position: 'absolute',
            flexDirection: 'row',
            alignItems: 'center',
            left: 0,
            right: 0,
            bottom: bottomStackOffset,
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: footerPaddingTop,
            paddingBottom: footerPaddingBottom,
            backgroundColor: tokens.colors.surface,
            borderTopWidth: 1,
            borderTopColor: tokens.colors.border,
          }}
        >
          <Snackbar
            visible={setActions.snackbarUndo.visible}
            message="Set deleted"
            actionLabel="UNDO"
            onAction={setActions.snackbarUndo.onUndoAction}
            minHeight={CTA_HEIGHT}
            style={{ marginBottom: setActions.snackbarUndo.visible ? CTA_STACK_GAP : 0 }}
          />
          <Button
            title={exerciseLimitReached ? 'Max 50 exercises' : 'Add exercise'}
            variant="secondary"
            disabled={session.status !== 'in_progress' || exerciseLimitReached}
            onPress={handleAddExercise}
            style={{ height: CTA_HEIGHT, flex: 1 }}
          />
          <View style={{ width: tokens.spacing.sm }} />
          <Button
            title="Finish workout"
            variant="primary"
            onPress={() => setFinishOpen(true)}
            style={{ height: CTA_HEIGHT, flex: 1 }}
          />
        </View>
      )}
      {FinishWorkoutSheet({
        visible: finishOpen,
        onClose: handleCloseFinish,
        onFinish: handleFinish,
        completedSets: totals.completedSets,
        totalSets: totals.totalSets,
        durationMinutes,
        isFinishing,
        workoutNote: workoutNoteDraft,
        onWorkoutNoteChange: handleWorkoutNoteChange,
        noteEditable: session.status === 'in_progress',
      })}
      <BottomSheetModal
        visible={Boolean(editingExercise)}
        title={editingExercise ? `${editingExercise.exercise_name} comment` : 'Exercise comment'}
        keyboardAware
        actions={
          canEditComment ? (
            <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
              <Button
                title="Clear"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  if (!editingExercise) return;
                  updateWorkoutSessionExerciseComment(editingExercise.id, null);
                  load();
                  setCommentEditorExerciseId(null);
                  setCommentDraft('');
                }}
              />
              <Button
                title="Save"
                variant="primary"
                style={{ flex: 1 }}
                onPress={() => {
                  if (!editingExercise) return;
                  updateWorkoutSessionExerciseComment(editingExercise.id, commentDraft);
                  load();
                  setCommentEditorExerciseId(null);
                  setCommentDraft('');
                }}
              />
            </View>
          ) : (
            <Text variant="muted">Comments are read-only after workout completion.</Text>
          )
        }
        onClose={() => {
          setCommentEditorExerciseId(null);
          setCommentDraft('');
        }}
      >
        <View>
          <Input
            value={commentDraft}
            onChangeText={(value) => setCommentDraft(value.slice(0, MAX_EXERCISE_COMMENT_LENGTH))}
            placeholder="Add an informational comment"
            maxLength={MAX_EXERCISE_COMMENT_LENGTH}
            editable={canEditComment}
            multiline
            textAlignVertical="top"
            inputStyle={{ minHeight: 90, paddingVertical: tokens.spacing.sm }}
            helperText={`${commentDraft.length}/${MAX_EXERCISE_COMMENT_LENGTH}`}
          />
        </View>
      </BottomSheetModal>
    </Screen>
  );
}
