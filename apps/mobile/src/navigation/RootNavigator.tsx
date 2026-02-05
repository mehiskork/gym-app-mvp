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
import { SessionDetailScreen } from '../screens/SessionDetailScreen';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';
import { DebugScreen } from '../screens/Debug/DebugScreen';
import { PrebuiltPlansScreen } from '../screens/PrebuiltPlansScreen';
import { ClaimStartScreen } from '../screens/ClaimStartScreen';
import { ClaimConfirmScreen } from '../screens/ClaimConfirmScreen';
import { tokens } from '../theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: tokens.colors.bg },
          headerTintColor: tokens.colors.text,
          headerShadowVisible: false,
          headerLargeTitle: false,
          contentStyle: { backgroundColor: tokens.colors.bg },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="WorkoutSession"
          component={WorkoutSessionScreen}
          options={{ presentation: 'modal', title: 'Workout', headerShown: true }}
        />
        <Stack.Screen
          name="StartWorkout"
          component={StartWorkoutScreen}
          options={{ title: 'Start workout' }}
        />
        <Stack.Screen
          name="CreateExercise"
          component={CreateExerciseScreen}
          options={{ presentation: 'modal', title: 'New exercise', headerShown: true }}
        />
        <Stack.Screen
          name="ExercisePicker"
          component={ExercisePickerScreen}
          options={{ presentation: 'modal', title: 'Exercises', headerShown: true }}
        />
        <Stack.Screen
          name="WorkoutPlanDetail"
          component={WorkoutPlanDetailScreen}
          options={{ title: 'Workout Plan' }}
        />
        <Stack.Screen
          name="PrebuiltPlans"
          component={PrebuiltPlansScreen}
          options={{ title: 'Prebuilt plans', headerShown: true }}
        />
        <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: 'Day' }} />
        <Stack.Screen
          name="SessionDetail"
          component={SessionDetailScreen}
          options={{ title: 'Session', headerShown: true }}
        />
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          options={{ title: 'Exercise', headerShown: true }}
        />
        <Stack.Screen
          name="ClaimStart"
          component={ClaimStartScreen}
          options={{ title: 'Link account', headerShown: true }}
        />
        <Stack.Screen
          name="ClaimConfirm"
          component={ClaimConfirmScreen}
          options={{ title: 'Confirm claim', headerShown: true }}
        />
        <Stack.Screen name="Debug" component={DebugScreen} options={{ title: 'Debug' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
