import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
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
import { PrebuiltPlanPreviewScreen } from '../screens/PrebuiltPlanPreviewScreen';
import { ClaimStartScreen } from '../screens/ClaimStartScreen';
import { tokens } from '../theme/tokens';
import { handleUnfinishedWorkoutReminderNotificationResponse } from '../utils/unfinishedWorkoutReminderNotifications';
import { logEvent } from '../utils/logger';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const pendingNotificationResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const handledNotificationIdRef = useRef<string | null>(null);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const notificationId = response.notification.request.identifier;
      if (handledNotificationIdRef.current === notificationId) return;

      if (!navigationRef.isReady()) {
        pendingNotificationResponseRef.current = response;
        return;
      }

      handledNotificationIdRef.current = notificationId;
      void handleUnfinishedWorkoutReminderNotificationResponse(response, navigationRef);
    },
    [navigationRef],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response);
      })
      .catch((error) => {
        logEvent('warn', 'notifications', 'Initial notification response lookup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => subscription.remove();
  }, [handleNotificationResponse]);

  const handleNavigationReady = useCallback(() => {
    const pending = pendingNotificationResponseRef.current;
    pendingNotificationResponseRef.current = null;
    if (pending) handleNotificationResponse(pending);
  }, [handleNotificationResponse]);

  return (
    <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
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
          options={{ title: 'Templates', headerShown: true }}
        />
        <Stack.Screen
          name="PrebuiltPlanPreview"
          component={PrebuiltPlanPreviewScreen}
          options={{ title: 'Template preview', headerShown: true }}
        />
        <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: 'Session' }} />
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
        <Stack.Screen name="Debug" component={DebugScreen} options={{ title: 'Debug' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
