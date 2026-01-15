import React, { useCallback, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
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
    const input = day?.name ?? '';
    setDayNameInput(input);
    setSavedName(input);

    if (day) setItems(listDayExercises(dayId));
    else setItems([]);
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
  const commitDayName = useCallback(() => {
    const next = dayNameInput.trim();
    const prev = savedName.trim();

    // Normalize: empty string => null in DB
    const nextDbValue = next.length === 0 ? null : next;

    if (next === prev) return;

    try {
      renameDay(dayId, nextDbValue);
      setSavedName(next); // keep state in sync without reloading
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to rename day';
      Alert.alert('Error', message);
      // revert input back to last-saved value
      setDayNameInput(savedName);
    }
  }, [dayId, dayNameInput, savedName]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<DayExerciseRow>) => (
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.spacing.sm,
            padding: tokens.spacing.md,
            backgroundColor: tokens.colors.surface,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: tokens.colors.border,
          },
          isActive
            ? {
                elevation: 6,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
                opacity: 0.98,
              }
            : null,
        ]}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle">{item.exercise_name}</AppText>
        </View>

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
          <Ionicons name="trash-outline" size={20} color={tokens.colors.textSecondary} />
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
          <AppText color="textSecondary">≡</AppText>
        </Pressable>
      </View>
    ),
    [confirmDeleteExercise],
  );

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.sm }}>
        <AppText variant="title">Day</AppText>

        <View style={{ gap: tokens.spacing.sm }}>
          <AppText color="textSecondary">Day name</AppText>
          <TextInput
            maxLength={50}
            value={dayNameInput}
            onChangeText={setDayNameInput}
            placeholder="e.g., Push"
            placeholderTextColor={tokens.colors.textSecondary}
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

        <PrimaryButton
          title="Add exercise"
          onPress={() => navigation.navigate('ExercisePicker', { dayId })}
        />

        <AppText color="textSecondary">Hold ≡ and drag to reorder exercises.</AppText>
      </View>

      <DraggableFlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<AppText color="textSecondary">No exercises yet.</AppText>}
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
      />
    </Screen>
  );
}
