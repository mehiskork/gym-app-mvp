import React from 'react';
import { View, Text, Button } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutSession'>;

export function WorkoutSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>Workout Session</Text>
      <Text style={{ marginBottom: 20 }}>sessionId: {sessionId}</Text>
      <Button title="Close" onPress={() => navigation.goBack()} />
    </View>
  );
}
