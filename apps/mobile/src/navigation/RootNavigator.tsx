import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import { MainTabs } from './MainTabs';
import { WorkoutSessionScreen } from '../screens/WorkoutSessionScreen';
import { CreateExerciseScreen } from '../screens/CreateExerciseScreen';
import { WorkoutPlanDetailScreen } from '../screens/WorkoutPlanDetailScreen';
import { DayDetailScreen } from '../screens/DayDetailScreen';
import { ExercisePickerScreen } from '../screens/ExercisePickerScreen';
import { StartWorkoutScreen } from '../screens/StartWorkoutScreen';

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
          name="StartWorkout"
          component={StartWorkoutScreen}
          options={{ title: 'Start workout' }}
        />

        <Stack.Screen
          name="CreateExercise"
          component={CreateExerciseScreen}
          options={{ presentation: 'modal', title: 'New Exercise' }}
        />
        <Stack.Screen
          name="ExercisePicker"
          component={ExercisePickerScreen}
          options={{ presentation: 'modal', title: 'Select Exercise' }}
        />
        <Stack.Screen
          name="WorkoutPlanDetail"
          component={WorkoutPlanDetailScreen}
          options={{ title: 'Workout Plan' }}
        />
        <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: 'Day' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
