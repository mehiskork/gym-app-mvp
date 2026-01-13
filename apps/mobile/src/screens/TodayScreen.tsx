import React from 'react';
import { View, Text, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TodayScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, marginBottom: 12 }}>Today</Text>
      <Button
        title="Open Workout"
        onPress={() => navigation.navigate('WorkoutSession', { sessionId: 'demo' })}
      />
    </View>
  );
}
