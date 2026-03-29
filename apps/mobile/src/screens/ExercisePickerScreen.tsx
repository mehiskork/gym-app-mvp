import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
const BOTTOM_CTA_HEIGHT = tokens.touchTargetMin + tokens.spacing.sm;
const TOP_CONTENT_PADDING = tokens.spacing.sm;

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
  const insets = useSafeAreaInsets();

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
    <Screen bottomInset="none" style={{ paddingBottom: 0 }} contentStyle={{ paddingTop: TOP_CONTENT_PADDING }}>
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
                setExerciseTypeFilter(toggleSingleSelect(exerciseTypeFilter, EXERCISE_TYPE.STRENGTH)),
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
          variant="primary"
          onPress={() => navigation.navigate('CreateExercise')}
          style={{ height: BOTTOM_CTA_HEIGHT }}
        >
          <Text variant="subtitle" weight="700" color={tokens.colors.onPrimary}>
            Create exercise
          </Text>
        </Button>
      </View>
    </Screen >
  );
}
