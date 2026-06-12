import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { Button, IconButton, Input, Screen, Snackbar, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { listSelectableExercisesForCurrentUser, type ExerciseRow } from '../db/exerciseRepo';
import { toggleExerciseFavorite } from '../db/exerciseFavoriteRepo';
import { EXERCISE_TYPE, type ExerciseType } from '../db/exerciseTypes';
import { useAppTheme } from '../theme/theme';
import {
  filterExercises,
  type ExerciseSourceFilter,
  toggleSingleSelect,
} from './exercisePickerFilters';

import { addExerciseToDay } from '../db/dayExerciseRepo';
import { appendWorkoutSessionExercise, swapWorkoutSessionExercise } from '../db/workoutLoggerRepo';
import { createQuickWorkoutSessionWithExercise } from '../db/workoutSessionRepo';
import { isWorkoutLimitError } from '../db/workoutLimits';

type Props = NativeStackScreenProps<RootStackParamList, 'ExercisePicker'>;
const BOTTOM_CTA_HEIGHT = tokens.touchTargetMin + tokens.spacing.sm;
const TOP_CONTENT_PADDING = tokens.spacing.sm;

export function ExercisePickerScreen({ route, navigation }: Props) {
  const dayId = route.params?.dayId ?? null;
  const swapSessionExerciseId = route.params?.swapSessionExerciseId ?? null;
  const swapSessionId = route.params?.swapSessionId ?? null;
  const addToSessionId = route.params?.addToSessionId ?? null;
  const isQuickWorkoutDraftMode = route.params?.quickWorkoutDraft === true;
  const isSwapMode = !!swapSessionExerciseId && !!swapSessionId;
  const isAddToSessionMode = !!addToSessionId && !isSwapMode && !isQuickWorkoutDraftMode;
  const isBrowseOnly = !dayId && !isSwapMode && !isAddToSessionMode && !isQuickWorkoutDraftMode;

  const [q, setQ] = useState('');
  const [all, setAll] = useState<ExerciseRow[]>([]);
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<ExerciseType | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ExerciseSourceFilter>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectInFlightRef = React.useRef(false);
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  const load = useCallback(() => {
    setAll(listSelectableExercisesForCurrentUser());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    return filterExercises(all, q, exerciseTypeFilter, sourceFilter);
  }, [all, q, exerciseTypeFilter, sourceFilter]);

  const releaseSelectGuardAfterCurrentTap = useCallback(() => {
    setTimeout(() => {
      selectInFlightRef.current = false;
    }, 0);
  }, []);

  const handleSelectExercise = useCallback(
    (item: ExerciseRow) => {
      if (isBrowseOnly) {
        navigation.navigate('ExerciseDetail', { exerciseId: item.id });
        return;
      }

      if (selectInFlightRef.current) return;
      selectInFlightRef.current = true;

      try {
        if (isSwapMode && swapSessionExerciseId && swapSessionId) {
          swapWorkoutSessionExercise({
            workoutSessionId: swapSessionId,
            workoutSessionExerciseId: swapSessionExerciseId,
            replacementExerciseId: item.id,
            replacementExerciseName: item.name,
          });
          navigation.goBack();
          releaseSelectGuardAfterCurrentTap();
          return;
        }

        if (isAddToSessionMode && addToSessionId) {
          appendWorkoutSessionExercise({
            workoutSessionId: addToSessionId,
            exerciseId: item.id,
            exerciseName: item.name,
          });
          navigation.goBack();
          releaseSelectGuardAfterCurrentTap();
          return;
        }

        if (isQuickWorkoutDraftMode) {
          const result = createQuickWorkoutSessionWithExercise({
            exerciseId: item.id,
            exerciseName: item.name,
          });
          navigation.dispatch(
            CommonActions.reset({
              index: 1,
              routes: [
                { name: 'MainTabs' },
                { name: 'WorkoutSession', params: { sessionId: result.sessionId } },
              ],
            }),
          );
          releaseSelectGuardAfterCurrentTap();
          return;
        }

        if (!dayId) {
          selectInFlightRef.current = false;
          return;
        }
        addExerciseToDay({ dayId, exerciseId: item.id });
        navigation.goBack();
        releaseSelectGuardAfterCurrentTap();
      } catch (error) {
        selectInFlightRef.current = false;
        setFeedback(
          isWorkoutLimitError(error) ? error.message : "Couldn't complete that action. Try again.",
        );
      }
    },
    [
      addToSessionId,
      dayId,
      isAddToSessionMode,
      isBrowseOnly,
      isQuickWorkoutDraftMode,
      isSwapMode,
      navigation,
      releaseSelectGuardAfterCurrentTap,
      swapSessionExerciseId,
      swapSessionId,
    ],
  );

  return (
    <Screen
      bottomInset="none"
      style={{ paddingBottom: 0 }}
      contentStyle={{ paddingTop: TOP_CONTENT_PADDING }}
    >
      <View style={{ flex: 1, gap: tokens.spacing.md }}>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Search exercises"
          placeholderTextColor={tokens.colors.textSecondary}
        />

        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {[
            {
              label: 'Strength',
              active: exerciseTypeFilter === EXERCISE_TYPE.STRENGTH,
              onPress: () =>
                setExerciseTypeFilter(
                  toggleSingleSelect(exerciseTypeFilter, EXERCISE_TYPE.STRENGTH),
                ),
            },
            {
              label: 'Cardio',
              active: exerciseTypeFilter === EXERCISE_TYPE.CARDIO,
              onPress: () =>
                setExerciseTypeFilter(toggleSingleSelect(exerciseTypeFilter, EXERCISE_TYPE.CARDIO)),
            },
            {
              label: 'Curated',
              active: sourceFilter === 'curated',
              onPress: () => setSourceFilter(toggleSingleSelect(sourceFilter, 'curated')),
            },
            {
              label: 'Custom',
              active: sourceFilter === 'custom',
              onPress: () => setSourceFilter(toggleSingleSelect(sourceFilter, 'custom')),
            },
          ].map((chip) => (
            <Pressable
              key={chip.label}
              onPress={chip.onPress}
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityState={{ selected: chip.active }}
            >
              <Text
                variant="muted"
                style={{
                  textAlign: 'center',
                  paddingVertical: tokens.spacing.sm,
                  paddingHorizontal: tokens.spacing.sm,
                  borderRadius: tokens.radius.lg,
                  backgroundColor: chip.active ? tokens.colors.secondary : tokens.colors.surface,
                  borderWidth: 1,
                  borderColor: chip.active ? tokens.colors.primary : tokens.colors.border,
                }}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingBottom: BOTTOM_CTA_HEIGHT + tokens.spacing.lg + tokens.spacing.xl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                minHeight: tokens.touchTargetMin + tokens.spacing.md * 2,
              }}
            >
              <Pressable
                onPress={() => handleSelectExercise(item)}
                style={({ pressed }) => [
                  { flex: 1, minWidth: 0 },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel={`${isBrowseOnly ? 'View details for' : 'Select'} ${item.name}`}
              >
                <Text variant="subtitle">{item.name}</Text>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                <IconButton
                  onPress={() => {
                    toggleExerciseFavorite(item.id);
                    load();
                  }}
                  accessibilityLabel={
                    item.is_favorite === 1 ? 'Remove from favorites' : 'Add to favorites'
                  }
                  icon={
                    <Ionicons name={item.is_favorite === 1 ? 'star' : 'star-outline'} size={20} />
                  }
                  iconColor={item.is_favorite === 1 ? colors.primary : tokens.colors.mutedText}
                />

                <IconButton
                  onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
                  accessibilityLabel={`Open details for ${item.name}`}
                  icon={<Ionicons name="information-circle-outline" size={20} />}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ marginTop: tokens.spacing.lg, gap: tokens.spacing.sm }}>
              <Text variant="muted">No matching exercises.</Text>
            </View>
          }
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -insets.bottom,
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: tokens.spacing.xs,
          paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
          backgroundColor: tokens.colors.surface,
          borderTopWidth: 1,
          borderTopColor: tokens.colors.border,
        }}
      >
        <Button
          title="Create a custom exercise"
          variant="secondary"
          onPress={() => navigation.navigate('CreateExercise')}
          style={{ height: BOTTOM_CTA_HEIGHT }}
        />
      </View>
      <Snackbar
        visible={feedback !== null}
        message={feedback ?? ''}
        variant="error"
        onDismiss={() => setFeedback(null)}
      />
    </Screen>
  );
}
