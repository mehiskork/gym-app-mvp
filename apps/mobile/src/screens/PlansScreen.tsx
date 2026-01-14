import React, { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { listExercises, type ExerciseRow } from '../db/exerciseRepo';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PlansScreen() {
  const navigation = useNavigation<Nav>();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);

  const load = useCallback(() => {
    setExercises(listExercises());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={{ gap: tokens.spacing.md, marginBottom: tokens.spacing.lg }}>
        <AppText variant="title">Exercises</AppText>
        <PrimaryButton
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
            <AppText variant="subtitle">{item.name}</AppText>
            <AppText color="textSecondary">{item.is_custom ? 'Custom' : 'Curated'}</AppText>
          </View>
        )}
      />
    </Screen>
  );
}
