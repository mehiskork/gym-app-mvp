import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Button, IconButton, Input, Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { listExercises, type ExerciseRow } from '../db/exerciseRepo';
import { EXERCISE_TYPE, type ExerciseType } from '../db/exerciseTypes';
import { filterExercises, type ExerciseSourceFilter, toggleSingleSelect } from './exercisePickerFilters';

import { getOrCreateLocalUserId } from '../db/appMetaRepo';
import { addExerciseToDay } from '../db/dayExerciseRepo';
import { appendWorkoutSessionExercise, swapWorkoutSessionExercise } from '../db/workoutLoggerRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ExercisePicker'>;

export function ExercisePickerScreen({ route, navigation }: Props) {
  const dayId = route.params?.dayId ?? null;
  const swapSessionExerciseId = route.params?.swapSessionExerciseId ?? null;
  const swapSessionId = route.params?.swapSessionId ?? null;
  const addToSessionId = route.params?.addToSessionId ?? null;
  const isSwapMode = !!swapSessionExerciseId && !!swapSessionId;
  const isAddToSessionMode = !!addToSessionId && !isSwapMode;
  const isBrowseOnly = !dayId && !isSwapMode && !isAddToSessionMode;

  const [q, setQ] = useState('');
  const [all, setAll] = useState<ExerciseRow[]>([]);
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<ExerciseType | null>(null);
  const [sourceFilter, setSourceFilter] = useState<ExerciseSourceFilter>(null);

  const load = useCallback(() => {
    const uid = getOrCreateLocalUserId();
    setAll(listExercises(uid));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    return filterExercises(all, q, exerciseTypeFilter, sourceFilter);
  }, [all, q, exerciseTypeFilter, sourceFilter]);

  return (
    <Screen bottomInset="none" style={{ gap: tokens.spacing.md }}>

      <Input
        value={q}
        onChangeText={setQ}
        placeholder="Search exercises"
        placeholderTextColor={tokens.colors.textSecondary}
      />

      <Button
        title="Create custom exercise"
        variant="secondary"
        onPress={() => navigation.navigate('CreateExercise')}
      />

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="muted">Type</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <Pressable
            onPress={() =>
              setExerciseTypeFilter(toggleSingleSelect(exerciseTypeFilter, EXERCISE_TYPE.STRENGTH))
            }
          >
            <Text
              variant="muted"
              style={{
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radius.lg,
                backgroundColor:
                  exerciseTypeFilter === EXERCISE_TYPE.STRENGTH
                    ? tokens.colors.secondary
                    : tokens.colors.surface,
                borderWidth: 1,
                borderColor:
                  exerciseTypeFilter === EXERCISE_TYPE.STRENGTH
                    ? tokens.colors.primary
                    : tokens.colors.border,
              }}
            >
              Strength
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setExerciseTypeFilter(toggleSingleSelect(exerciseTypeFilter, EXERCISE_TYPE.CARDIO))
            }
          >
            <Text
              variant="muted"
              style={{
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radius.lg,
                backgroundColor:
                  exerciseTypeFilter === EXERCISE_TYPE.CARDIO
                    ? tokens.colors.secondary
                    : tokens.colors.surface,
                borderWidth: 1,
                borderColor:
                  exerciseTypeFilter === EXERCISE_TYPE.CARDIO
                    ? tokens.colors.primary
                    : tokens.colors.border,
              }}
            >
              Cardio
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="muted">Source</Text>
        <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          <Pressable onPress={() => setSourceFilter(toggleSingleSelect(sourceFilter, 'curated'))}>
            <Text
              variant="muted"
              style={{
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radius.lg,
                backgroundColor:
                  sourceFilter === 'curated' ? tokens.colors.secondary : tokens.colors.surface,
                borderWidth: 1,
                borderColor:
                  sourceFilter === 'curated' ? tokens.colors.primary : tokens.colors.border,
              }}
            >
              Curated
            </Text>
          </Pressable>
          <Pressable onPress={() => setSourceFilter(toggleSingleSelect(sourceFilter, 'custom'))}>
            <Text
              variant="muted"
              style={{
                paddingVertical: tokens.spacing.sm,
                paddingHorizontal: tokens.spacing.md,
                borderRadius: tokens.radius.lg,
                backgroundColor:
                  sourceFilter === 'custom' ? tokens.colors.secondary : tokens.colors.surface,
                borderWidth: 1,
                borderColor:
                  sourceFilter === 'custom' ? tokens.colors.primary : tokens.colors.border,
              }}
            >
              Custom
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
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
            }}
          >
            <Pressable
              onPress={() => {
                if (isBrowseOnly) {
                  navigation.navigate('ExerciseDetail', { exerciseId: item.id });
                  return;
                }

                try {
                  if (isSwapMode && swapSessionExerciseId && swapSessionId) {
                    swapWorkoutSessionExercise({
                      workoutSessionId: swapSessionId,
                      workoutSessionExerciseId: swapSessionExerciseId,
                      replacementExerciseId: item.id,
                      replacementExerciseName: item.name,
                    });
                    navigation.goBack();
                    return;
                  }

                  if (isAddToSessionMode && addToSessionId) {
                    appendWorkoutSessionExercise({
                      workoutSessionId: addToSessionId,
                      exerciseId: item.id,
                      exerciseName: item.name,
                    });
                    navigation.goBack();
                    return;
                  }

                  if (!dayId) return;
                  addExerciseToDay({ dayId, exerciseId: item.id });
                  navigation.goBack();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  Alert.alert(
                    isSwapMode ? 'Failed to swap exercise' : 'Failed to add exercise',
                    msg,
                  );
                }
              }}
              style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.85 } : null]}
              accessibilityLabel={`${isBrowseOnly ? 'View details for' : 'Select'} ${item.name}`}
            >
              <Text variant="subtitle">{item.name}</Text>

            </Pressable>

            <IconButton
              onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
              accessibilityLabel={`Open details for ${item.name}`}
              icon={<Ionicons name="information-circle-outline" size={20} />}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginTop: tokens.spacing.lg, gap: tokens.spacing.sm }}>
            <Text variant="muted">No matching exercises.</Text>
            <Button
              title="Create new exercise"
              onPress={() => navigation.navigate('CreateExercise')}
            />
          </View>
        }
      />
    </Screen>
  );
}
