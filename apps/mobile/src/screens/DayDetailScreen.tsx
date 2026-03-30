import React, { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
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
  Text,
  DestructiveConfirmDialog,
} from '../ui';
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';
import {
  deleteDayExercise,
  getDayById,
  listDayExercises,
  renameDay,
  reorderDayExercises,
  type DayExerciseRow,
} from '../db/dayExerciseRepo';
import {
  createSessionFromPlanDay,
  getInProgressSession,
  getSessionById,
} from '../db/workoutSessionRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'DayDetail'>;

export function DayDetailScreen({ route, navigation }: Props) {
  const { dayId, workoutPlanId, mode = 'edit' } = route.params;

  const [dayNameInput, setDayNameInput] = useState<string>('');
  const [savedName, setSavedName] = useState<string>('');
  const [items, setItems] = useState<DayExerciseRow[]>([]);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [deleteExerciseTarget, setDeleteExerciseTarget] = useState<DayExerciseRow | null>(null);
  const { colors } = useAppTheme();

  const load = useCallback(() => {
    const day = getDayById(dayId);
    if (!day) {
      setDayNameInput('');
      setSavedName('');
      setItems([]);
      return;
    }

    const input = day.name ?? '';
    setDayNameInput(input);
    setSavedName(input);

    setItems(listDayExercises(dayId));
  }, [dayId]);

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
      Alert.alert('Error', 'Missing workout plan for start flow.');
      return;
    }

    const sessionId = createSessionFromPlanDay({ workoutPlanId, dayId });
    const createdSession = getSessionById(sessionId);
    if (!createdSession) {
      Alert.alert('Unable to start workout', 'Please try again.');
      return;
    }
    navigation.replace('WorkoutSession', { sessionId });
  }, [dayId, navigation, workoutPlanId]);

  const handleAddExercise = useCallback(() => {
    navigation.navigate('ExercisePicker', { dayId });
  }, [dayId, navigation]);

  const commitDayName = useCallback(() => {
    const next = dayNameInput.trim();
    const prev = savedName.trim();
    const nextDbValue = next.length === 0 ? null : next;

    if (next === prev) return;

    try {
      renameDay(dayId, nextDbValue);
      setSavedName(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to rename session';
      Alert.alert('Error', message);
      setDayNameInput(savedName);
    }
  }, [dayId, dayNameInput, savedName]);

  const confirmDeleteExercise = useCallback((row: DayExerciseRow) => {
    setDeleteExerciseTarget(row);
  }, []);

  const handleDeleteExercise = useCallback(() => {
    if (!deleteExerciseTarget) return;
    deleteDayExercise(deleteExerciseTarget.id);
    setDeleteExerciseTarget(null);
    load();
  }, [deleteExerciseTarget, load]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DayExerciseRow>) => (
      <ListRow
        title={item.exercise_name}
        subtitle={isStartSessionMode ? 'View exercise' : 'Tap to view'}
        left={
          <IconChip variant="primarySoft" size={40}>
            <Ionicons name="barbell-outline" size={18} color={colors.primary} />
          </IconChip>
        }
        onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.exercise_id })}
        showChevron
        right={
          isStartSessionMode ? undefined : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
              <Pressable
                onPress={() => confirmDeleteExercise(item)}
                style={({ pressed }) => [
                  {
                    minHeight: tokens.touchTargetMin,
                    minWidth: tokens.touchTargetMin,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.sm,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                  },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="Delete exercise"
              >
                <Ionicons name="trash-outline" size={18} color={tokens.colors.destructive} />
              </Pressable>
              <Pressable
                onLongPress={drag}
                delayLongPress={150}
                style={({ pressed }) => [
                  {
                    minHeight: tokens.touchTargetMin,
                    minWidth: tokens.touchTargetMin,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: tokens.radius.sm,
                    borderWidth: 1,
                    borderColor: tokens.colors.border,
                  },
                  pressed ? { opacity: 0.85 } : null,
                ]}
                accessibilityLabel="Reorder exercise"
              >
                <Ionicons name="reorder-three-outline" size={18} color={tokens.colors.mutedText} />
              </Pressable>
            </View>
          )
        }
        style={
          isActive
            ? {
                backgroundColor: tokens.colors.surface2,
                borderColor: tokens.colors.primary,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
              }
            : undefined
        }
      />
    ),
    [confirmDeleteExercise, isStartSessionMode, navigation],
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
              <Button title="Add exercise" onPress={handleAddExercise} />
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
            <Button title="Add exercise" variant="secondary" onPress={handleAddExercise} />
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
      </Screen>
    );
  }

  return (
    <Screen padded={false} bottomInset="none" style={{ flex: 1 }}>
      <DraggableFlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        contentContainerStyle={{
          padding: tokens.spacing.lg,
          paddingBottom: tokens.spacing.xl,
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
                load();
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
    </Screen>
  );
}
