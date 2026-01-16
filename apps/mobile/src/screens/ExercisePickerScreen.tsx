import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { listExercises, type ExerciseRow } from '../db/exerciseRepo';

import { getOrCreateLocalUserId } from '../db/appMetaRepo';
import { addExerciseToDay } from '../db/dayExerciseRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'ExercisePicker'>;

export function ExercisePickerScreen({ route, navigation }: Props) {
  const { dayId } = route.params;

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
    <Screen style={{ gap: tokens.spacing.md }}>
      <AppText variant="title">Select exercise</AppText>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            title="New exercise"
            onPress={() => navigation.navigate('CreateExercise')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SecondaryButton title="Close" onPress={() => navigation.goBack()} />
        </View>
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search exercises"
        placeholderTextColor={tokens.colors.textSecondary}
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
                try {
                  addExerciseToDay({ dayId, exerciseId: item.id });
                  navigation.goBack();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  Alert.alert('Failed to add exercise', msg);
                }
              }}
              style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.85 } : null]}
              accessibilityLabel={`Add ${item.name}`}
            >
              <AppText variant="subtitle">{item.name}</AppText>
              <AppText color="textSecondary">{item.is_custom ? 'Custom' : 'Curated'}</AppText>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
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
              accessibilityLabel={`Open details for ${item.name}`}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={tokens.colors.textSecondary}
              />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginTop: tokens.spacing.lg, gap: tokens.spacing.sm }}>
            <AppText color="textSecondary">No matching exercises.</AppText>
            <PrimaryButton
              title="Create new exercise"
              onPress={() => navigation.navigate('CreateExercise')}
            />
          </View>
        }
      />
    </Screen>
  );
}
