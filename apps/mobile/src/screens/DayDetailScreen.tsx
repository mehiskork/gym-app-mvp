import React, { useCallback, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Button, Card, EmptyState, IconChip, ListRow, Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import {
  deleteDayExercise,
  getDayById,
  listDayExercises,
  renameDay,
  reorderDayExercises,
  type DayExerciseRow,
} from '../db/dayExerciseRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'DayDetail'>;

export function DayDetailScreen({ route, navigation }: Props) {
  const { dayId } = route.params;

  const [dayNameInput, setDayNameInput] = useState<string>('');
  const [savedName, setSavedName] = useState<string>('');
  const [items, setItems] = useState<DayExerciseRow[]>([]);

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
      navigation.setOptions({ title: 'Day' });
    }, [navigation]),
  );

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
      const message = e instanceof Error ? e.message : 'Failed to rename day';
      Alert.alert('Error', message);
      setDayNameInput(savedName);
    }
  }, [dayId, dayNameInput, savedName]);

  const confirmDeleteExercise = useCallback(
    (row: DayExerciseRow) => {
      Alert.alert('Delete exercise?', `"${row.exercise_name}" will be removed from this day.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteDayExercise(row.id);
            load();
          },
        },
      ]);
    },
    [load],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DayExerciseRow>) => (
      <ListRow
        title={item.exercise_name}
        subtitle="Tap to view"
        left={
          <IconChip variant="muted" size={40}>
            <Ionicons name="barbell-outline" size={18} color={tokens.colors.mutedText} />
          </IconChip>
        }
        onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.exercise_id })}
        showChevron
        right={
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
              <Ionicons name="trash-outline" size={18} color={tokens.colors.mutedText} />
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
    [confirmDeleteExercise, navigation],
  );

  const header = (
    <View style={{ marginBottom: tokens.spacing.md }}>
      <Card>
        <View style={{ gap: tokens.spacing.md }}>
          <View style={{ gap: tokens.spacing.xs }}>
            <Text variant="label" color={tokens.colors.mutedText}>
              Day name
            </Text>
            <TextInput
              maxLength={50}
              value={dayNameInput}
              onChangeText={setDayNameInput}
              placeholder="e.g., Push"
              placeholderTextColor={tokens.colors.mutedText}
              returnKeyType="done"
              onSubmitEditing={commitDayName}
              onEndEditing={commitDayName}
              style={{
                minHeight: tokens.touchTargetMin,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                paddingHorizontal: tokens.spacing.md,
                color: tokens.colors.text,
                backgroundColor: tokens.colors.surface,
              }}
            />
          </View>
          <Text variant="muted">
            {items.length} exercise{items.length === 1 ? '' : 's'}
          </Text>
          <Button title="Add exercise" onPress={handleAddExercise} />
          <Text variant="muted">Hold the reorder handle to move exercises.</Text>
        </View>
      </Card>
    </View>
  );

  return (
    <Screen padded={false} bottomInset="tabBar" style={{ flex: 1 }}>
      <DraggableFlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon={<Ionicons name="barbell-outline" size={24} color={tokens.colors.mutedText} />}
              title="No exercises yet"
              description="Add your first exercise to start logging."
              action={<Button title="Add exercise" variant="secondary" onPress={handleAddExercise} />}
            />
          </Card>
        }
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        contentContainerStyle={{
          padding: tokens.spacing.lg,
          paddingBottom: tokens.spacing.xl,
        }}
        onDragBegin={() => {
          void Haptics.selectionAsync();
        }}
        onDragEnd={({ data }) => {
          setItems(data);
          reorderDayExercises(
            dayId,
            data.map((x) => x.id),
          );
          load();
        }}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
