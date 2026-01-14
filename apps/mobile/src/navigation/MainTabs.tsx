import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { TodayScreen } from '../screens/TodayScreen';
import { WorkoutPlansScreen } from '../screens/WorkoutPlansScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen
        name="WorkoutPlans"
        component={WorkoutPlansScreen}
        options={{ title: 'Workout Plans' }}
      />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
