import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_ROUTES } from '../navigation/routes';
import type { RootStackParamList } from '../navigation/types';
import { Button, Card, EmptyState, IconButton, IconChip, Screen, Snackbar, Text } from '../ui';
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import { completeSession } from '../db/workoutSessionRepo';
import {
  addWorkoutSet,
  clearRestTimer,
  getWorkoutLoggerData,
  startRestTimer,
  updateWorkoutSet,
  deleteWorkoutSet,
  restoreWorkoutSet,
  type LoggerExercise,
  type LoggerSession,
  type LoggerSet,
} from '../db/workoutLoggerRepo';
import { formatRestCountdown, getRemainingSeconds } from '../utils/format';
import { parseTimestampMs } from '../utils/timestamp';
import { ExerciseCard } from '../features/workoutSession/ExerciseCard';
import { SetRow } from '../features/workoutSession/SetRow';
import { FinishWorkoutSheet } from '../features/workoutSession/FinishWorkoutSheet';
import { WorkoutSessionHeaderCard } from '../features/workoutSession/WorkoutSessionHeaderCard';
import { useSnackbarUndo } from '../hooks/useSnackbarUndo';
import { getSettings } from '../db/settingsRepo';
import { maybeTriggerRestTimerHaptics } from '../utils/restTimer';
import {
  cancelRestTimerNotification,
  scheduleRestTimerNotification,
} from '../utils/restTimerNotifications';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

const REST_TIMER_HEIGHT = tokens.touchTargetMin + tokens.spacing.xl;
const CTA_HEIGHT = tokens.touchTargetMin + tokens.spacing.sm;
const CTA_STACK_GAP = tokens.spacing.sm;
const KEEP_AWAKE_TAG = 'workout-session';

function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function getExerciseSubtitle(exercise: LoggerExercise): string | null {
  if (exercise.sets.length === 0) return null;
  const completed = exercise.sets.filter((set) => set.is_completed === 1).length;
  return `${completed}/${exercise.sets.length} sets complete`;
}

export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  const isFocused = useIsFocused();
  const [session, setSession] = useState<LoggerSession | null>(null);
  const [exercises, setExercises] = useState<LoggerExercise[]>([]);
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState(getSettings());

  const [finishOpen, setFinishOpen] = useState(false);
  const { colors } = useAppTheme();
  const [isFinishing, setIsFinishing] = useState(false);
  const insets = useSafeAreaInsets();
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollOffsetYRef = useRef(0);
  const activeRowMetricsRef = useRef<{ pageY: number; height: number } | null>(null);
  const restHapticsRef = useRef(false);
  const isExitingToHomeRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const resetToHome = useCallback((showMessage = false) => {
    if (isExitingToHomeRef.current) return;
    isExitingToHomeRef.current = true;
    if (showMessage) Alert.alert('Workout session unavailable', 'Returning to Home.');
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      }),
    );
  }, [navigation]);
  const load = useCallback(() => {
    const data = getWorkoutLoggerData(sessionId);
    if (!data) {
      setSession(null);
      setExercises([]);
      resetToHome(true);
      return;
    }
    setSession(data.session);
    setExercises(data.exercises);
  }, [resetToHome, sessionId]);

  const snackbarUndo = useSnackbarUndo<LoggerSet>({
    onUndo: (payload) => {
      restoreWorkoutSet(payload);
      load();
    },
  });

  useFocusEffect(
    useCallback(() => {
      load();
      setSettings(getSettings());
    }, [load]),
  );

  const remainingSeconds = useMemo(
    () => getRemainingSeconds(session?.rest_timer_end_at ?? null),
    [session?.rest_timer_end_at, tick],
  );

  const timerActive = (session?.rest_timer_end_at ?? null) !== null;

  useEffect(() => {
    // lightweight timer tick for countdown UI (DB remains source of truth)
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!timerActive) {
      restHapticsRef.current = false;
      return;
    }
    void maybeTriggerRestTimerHaptics(
      remainingSeconds,
      settings.restTimerVibration,
      restHapticsRef,
    );
  }, [remainingSeconds, settings.restTimerVibration, timerActive]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


  useEffect(() => {
    if (isFocused && settings.keepScreenOn && session?.status === 'in_progress') {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
    return undefined;
  }, [isFocused, settings.keepScreenOn, session?.status]);

  useFocusEffect(
    useCallback(() => {
      if (session?.title) navigation.setOptions({ title: session.title });
    }, [navigation, session?.title]),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        if (!['GO_BACK', 'POP', 'POP_TO_TOP'].includes(e.data.action.type)) return;
        e.preventDefault();
        resetToHome();
      });
      return unsubscribe;
    }, [navigation, resetToHome]),
  );

  const totals = useMemo(() => {
    const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const completedSets = exercises.reduce(
      (sum, exercise) => sum + exercise.sets.filter((set) => set.is_completed === 1).length,
      0,
    );
    return { totalSets, completedSets };
  }, [exercises]);

  const currentExerciseId = useMemo(() => {
    const firstIncomplete = exercises.find((exercise) =>
      exercise.sets.some((set) => set.is_completed !== 1),
    );
    return firstIncomplete?.id ?? exercises[0]?.id ?? null;
  }, [exercises]);

  const durationMinutes = useMemo(() => {
    if (!session?.started_at) return 0;
    const startTime = parseTimestampMs(session.started_at);
    if (startTime === null) return 0;
    const endTime = Date.now();
    const diffMs = Math.max(0, endTime - startTime);
    return Math.round(diffMs / 60000);
  }, [session?.started_at, tick]);

  const handleFinish = useCallback(() => {
    setIsFinishing(true);
    setFinishOpen(false);
    try {
      completeSession(sessionId);
      clearRestTimer(sessionId);
      void cancelRestTimerNotification();
      load();
      navigation.navigate('MainTabs', { screen: TAB_ROUTES.Home });
    } finally {
      setIsFinishing(false);
    }
  }, [load, navigation, sessionId]);

  const handleCloseFinish = useCallback(() => {
    if (isFinishing) return;
    setFinishOpen(false);
  }, [isFinishing]);

  const footerPaddingBottom = Math.max(insets.bottom, tokens.spacing.sm);
  const footerPaddingTop = tokens.spacing.sm;
  const footerHeight = CTA_HEIGHT + footerPaddingTop + footerPaddingBottom;
  const footerOverlapHeight = Math.max(footerHeight - insets.bottom, CTA_HEIGHT);
  const bottomStackHeight =
    footerOverlapHeight + (snackbarUndo.visible ? CTA_HEIGHT + CTA_STACK_GAP : 0);
  const bottomStackOffset = -insets.bottom;
  const baseScrollPaddingTop = tokens.spacing.md;
  const scrollPaddingTop = timerActive
    ? baseScrollPaddingTop + REST_TIMER_HEIGHT + tokens.spacing.lg
    : baseScrollPaddingTop;
  const restTimerTop = tokens.spacing.xs - insets.top;
  const keyboardOpen = keyboardHeight > 0;
  const keyboardSpacer = keyboardOpen ? keyboardHeight + tokens.spacing.lg : 0;

  const handleSetEditFocus = useCallback(
    ({ pageY, height }: { pageY: number; height: number }) => {
      activeRowMetricsRef.current = { pageY, height };
      if (!keyboardOpen) return;
      const viewportBottom =
        (Platform.OS === 'ios' ? 0 : insets.bottom) +
        tokens.touchTargetMin +
        tokens.spacing.md;
      const visibleBottom = pageY + height;
      const keyboardTop = Dimensions.get('window').height - keyboardHeight - viewportBottom;
      if (visibleBottom <= keyboardTop) return;
      const neededOffset = visibleBottom - keyboardTop + tokens.spacing.sm;
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollOffsetYRef.current + neededOffset),
        animated: true,
      });
    },
    [insets.bottom, keyboardHeight, keyboardOpen],
  );

  useEffect(() => {
    if (!keyboardOpen || !activeRowMetricsRef.current) return;
    handleSetEditFocus(activeRowMetricsRef.current);
  }, [handleSetEditFocus, keyboardOpen]);
  if (!session) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Text variant="title">Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false} bottomInset="none" contentStyle={{ paddingTop: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          onScroll={(event) => {
            scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: scrollPaddingTop,
            paddingBottom: bottomStackHeight + keyboardSpacer + tokens.spacing.lg,
            gap: tokens.spacing.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          <WorkoutSessionHeaderCard status={session.status} startedAt={session.started_at} />

          {exercises.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Ionicons name="barbell-outline" size={24} color={colors.primary} />}
                title="No exercises yet"
                description="Add exercises to start logging your sets."
              />
            </Card>
          ) : (
            exercises.map((ex) => {
              return (
                <ExerciseCard
                  key={ex.id}
                  name={ex.exercise_name}
                  subtitle={getExerciseSubtitle(ex)}
                  onPressTitle={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: ex.exercise_id })
                  }
                  onAddSet={() => {
                    addWorkoutSet(ex.id);
                    void Haptics.selectionAsync();
                    load();
                  }}
                  onSwap={() =>
                    navigation.navigate('ExercisePicker', {
                      swapSessionExerciseId: ex.id,
                      swapSessionId: sessionId,
                      returnTo: 'WorkoutSession',
                    })
                  }
                >
                  {ex.sets.map((set) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      onWeightEndEditing={(value) => {
                        updateWorkoutSet(set.id, { weight: parseNumber(value) });
                        load();
                      }}
                      onRepsEndEditing={(value) => {
                        const n = parseNumber(value);
                        updateWorkoutSet(set.id, {
                          reps: n === null ? null : Math.max(0, Math.floor(n)),
                        });
                        load();
                      }}
                      onToggleComplete={() => {
                        const done = set.is_completed === 1;
                        updateWorkoutSet(set.id, { is_completed: done ? 0 : 1 });
                        void Haptics.selectionAsync();
                        // Start rest timer when marking done
                        if (!done && settings.autoStartRestTimer) {
                          startRestTimer(sessionId, settings.defaultRestSeconds, ex.exercise_name);
                          if (settings.restTimerNotifications) {
                            void scheduleRestTimerNotification(settings.defaultRestSeconds, settings.restTimerVibration);
                          }
                        }
                        load();
                      }}
                      onDelete={() => {
                        deleteWorkoutSet(set.id);
                        snackbarUndo.showUndo(set);
                        load();
                      }}
                      onEditFocus={handleSetEditFocus}
                    />
                  ))}
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
              onPress={() => {
                setSession((prev) =>
                  prev
                    ? {
                      ...prev,
                      rest_timer_end_at: null,
                      rest_timer_label: null,
                      rest_timer_seconds: null,
                    }
                    : prev,
                );

                clearRestTimer(sessionId);
                void cancelRestTimerNotification();
              }}

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
            visible={snackbarUndo.visible}
            message="Set deleted"
            actionLabel="UNDO"
            onAction={snackbarUndo.onUndoAction}
            minHeight={CTA_HEIGHT}
            style={{ marginBottom: snackbarUndo.visible ? CTA_STACK_GAP : 0 }}
          />
          <Button
            title="Finish workout"
            variant="primary"
            onPress={() => setFinishOpen(true)}
            style={{ height: CTA_HEIGHT }}
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
      })}
    </Screen>
  );
}
