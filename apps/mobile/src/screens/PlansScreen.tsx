import React, { useMemo } from 'react';
import { FlatList, View } from 'react-native';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import { listExercises } from '../db/exerciseRepo';

export function PlansScreen() {
  const exercises = useMemo(() => listExercises(), []);

  return (
    <Screen>
      <AppText variant="title" style={{ marginBottom: tokens.spacing.lg }}>
        Plans (DB Test)
      </AppText>

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
            <AppText color="textSecondary">id: {item.id}</AppText>
          </View>
        )}
      />
    </Screen>
  );
}
