import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TodayScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <Screen style={{ justifyContent: 'center', gap: tokens.spacing.lg }}>
      <AppText variant="title">Today</AppText>
      <PrimaryButton
        title="Open Workout"
        onPress={() => navigation.navigate('WorkoutSession', { sessionId: 'demo' })}
      />
    </Screen>
  );
}
