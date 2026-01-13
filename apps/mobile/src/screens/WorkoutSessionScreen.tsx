import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  return (
    <Screen style={{ justifyContent: 'center', gap: tokens.spacing.md }}>
      <AppText variant="title">Workout Session</AppText>
      <AppText color="textSecondary">sessionId: {sessionId}</AppText>
      <SecondaryButton title="Close" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
