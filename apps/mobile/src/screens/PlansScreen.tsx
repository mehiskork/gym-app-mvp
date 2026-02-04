import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen, Text } from '../ui';
import { Button } from '../ui/Button';
import { tokens } from '../theme/tokens';
import { listExercises, type ExerciseRow } from '../db/exerciseRepo';
import type { RootStackParamList } from '../navigation/types';
import { getOrCreateLocalUserId } from '../db/appMetaRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PlansScreen() {
  const navigation = useNavigation<Nav>();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);

  const load = useCallback(() => {
    setExercises(listExercises(getOrCreateLocalUserId()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={{ gap: tokens.spacing.md, marginBottom: tokens.spacing.lg }}>
        <Text variant="title">Exercises</Text>
        <Button
          title="Add custom exercise"
          onPress={() => navigation.navigate('CreateExercise')}
        />
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        renderItem={({ item }) => (
          <View
            style={{
              padding: tokens.spacing.md,
              backgroundColor: tokens.colors.surface,
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: tokens.colors.border,
            }}
          >
            <Text variant="subtitle">{item.name}</Text>
            <Text color={tokens.colors.textSecondary}>{item.is_custom ? 'Custom' : 'Curated'}</Text>
          </View>
        )}
      />
    </Screen>
  );
}
