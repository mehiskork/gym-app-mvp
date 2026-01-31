import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Button, Card, Screen, Text } from '../ui';
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
      <Text variant="title">Today</Text>

      {inProgressId ? (
        <Card>
          <View style={{ gap: tokens.spacing.sm }}>
            <Text variant="muted">You have an in-progress workout.</Text>
            <Button
              title="Resume workout"
              onPress={() => navigation.navigate('WorkoutSession', { sessionId: inProgressId })}
            />
            <Button
              title="Start new workout"
              variant="secondary"
              onPress={() => navigation.navigate('StartWorkout')}
            />
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ gap: tokens.spacing.sm }}>
            <Text variant="muted">No workout in progress.</Text>
            <Button title="Start workout" onPress={() => navigation.navigate('StartWorkout')} />
          </View>
        </Card>
      )}
    </Screen>
  );
}
