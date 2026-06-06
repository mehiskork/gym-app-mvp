import React, { useCallback } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList } from '../navigation/types';
import { Button, Card, EmptyState, Screen } from '../ui';
import { tokens } from '../theme/tokens';
import { useAppTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'QuickWorkoutDraft'>;

export function QuickWorkoutDraftScreen({ navigation }: Props) {
  const { colors } = useAppTheme();

  const handleAddExercise = useCallback(() => {
    navigation.navigate('ExercisePicker', { quickWorkoutDraft: true });
  }, [navigation]);

  return (
    <Screen padded={false} bottomInset="none">
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: tokens.spacing.lg,
        }}
      >
        <Card>
          <EmptyState
            icon={<Ionicons name="barbell-outline" size={24} color={colors.primary} />}
            title="Quick Workout"
            description="Add your first exercise to start this workout."
            action={<Button title="Add Exercise" variant="secondary" onPress={handleAddExercise} />}
          />
        </Card>
      </View>
    </Screen>
  );
}
