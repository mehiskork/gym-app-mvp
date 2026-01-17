import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { getInProgressSession } from '../db/workoutSessionRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const [inProgressId, setInProgressId] = useState<string | null>(null);

  const load = useCallback(() => {
    const s = getInProgressSession();
    setInProgressId(s?.id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <AppText variant="title">Today</AppText>

      {inProgressId ? (
        <View style={{ gap: tokens.spacing.sm }}>
          <AppText color="textSecondary">You have an in-progress workout.</AppText>
          <PrimaryButton
            title="Resume workout"
            onPress={() => navigation.navigate('WorkoutSession', { sessionId: inProgressId })}
          />
          <PrimaryButton
            title="Start new workout"
            onPress={() => navigation.navigate('StartWorkout')}
          />
        </View>
      ) : (
        <View style={{ gap: tokens.spacing.sm }}>
          <AppText color="textSecondary">No workout in progress.</AppText>
          <PrimaryButton
            title="Start workout"
            onPress={() => navigation.navigate('StartWorkout')}
          />
        </View>
      )}
    </Screen>
  );
}
