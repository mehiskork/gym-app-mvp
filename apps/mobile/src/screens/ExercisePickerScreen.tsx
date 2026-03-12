import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Button, IconButton, Input, Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import { listExercises, type ExerciseRow } from '../db/exerciseRepo';

import { getOrCreateLocalUserId } from '../db/appMetaRepo';
import { addExerciseToDay } from '../db/dayExerciseRepo';
import { swapWorkoutSessionExercise } from '../db/workoutLoggerRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ExercisePicker'>;

export function ExercisePickerScreen({ route, navigation }: Props) {
  const dayId = route.params?.dayId ?? null;
  const swapSessionExerciseId = route.params?.swapSessionExerciseId ?? null;
  const swapSessionId = route.params?.swapSessionId ?? null;
  const isSwapMode = !!swapSessionExerciseId && !!swapSessionId;
  const isBrowseOnly = !dayId && !isSwapMode;

  const [q, setQ] = useState('');
  const [all, setAll] = useState<ExerciseRow[]>([]);

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
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter((x) => x.name.toLowerCase().includes(query));
  }, [all, q]);

  return (
    <Screen bottomInset="none" style={{ gap: tokens.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            title="New exercise"
            variant="secondary"
            onPress={() => navigation.navigate('CreateExercise')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Close" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>

      <Input
        value={q}
        onChangeText={setQ}
        placeholder="Search exercises"
        placeholderTextColor={tokens.colors.textSecondary}
      />

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
              accessibilityLabel={`${isBrowseOnly ? 'View' : isSwapMode ? 'Swap to' : 'Add'} ${item.name}`}
            >
              <Text variant="subtitle">{item.name}</Text>
              <Text variant="muted">{item.is_custom ? 'Custom' : 'Curated'}</Text>
              <Text variant="muted">
                {isBrowseOnly ? 'Tap to view details' : isSwapMode ? 'Tap to swap' : 'Tap to add to session'}
              </Text>
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
