import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import { WorkoutSessionScreen } from '../screens/WorkoutSessionScreen';
import { CreateExerciseScreen } from '../screens/CreateExerciseScreen';
import { WorkoutPlanDetailScreen } from '../screens/WorkoutPlanDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="WorkoutSession"
          component={WorkoutSessionScreen}
          options={{ presentation: 'modal', title: 'Workout' }}
        />
        <Stack.Screen
          name="CreateExercise"
          component={CreateExerciseScreen}
          options={{ presentation: 'modal', title: 'New Exercise' }}
        />
        <Stack.Screen
          name="WorkoutPlanDetail"
          component={WorkoutPlanDetailScreen}
          options={{ title: 'Workout Plan' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
