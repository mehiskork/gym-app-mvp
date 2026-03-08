import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import type { TabParamList } from './types';
import { TAB_ROUTES } from './routes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TodayScreen } from '../screens/TodayScreen';
import { WorkoutPlansScreen } from '../screens/WorkoutPlansScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { tokens } from '../theme/tokens';

const Tab = createBottomTabNavigator<TabParamList>();

export function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerLargeTitle: false,
        headerTintColor: tokens.colors.text,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: tokens.colors.bg,
          elevation: 0,
        },
        sceneContainerStyle: { backgroundColor: tokens.colors.bg },
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.mutedText,
        tabBarStyle: {
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.border,
          height: tokens.layout.tabBarHeight + insets.bottom,
          paddingTop: tokens.spacing.xs,
          paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIconStyle: {
          marginTop: tokens.spacing.xs,
        },
        tabBarIcon: ({ color, focused, size }) => {
          let iconName: React.ComponentProps<typeof Ionicons>['name'];

          switch (route.name) {
            case TAB_ROUTES.Home:
              iconName = focused ? 'flame' : 'flame-outline';
              break;
            case TAB_ROUTES.WorkoutPlans:
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case TAB_ROUTES.History:
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
              break;
            case TAB_ROUTES.Settings:
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'ellipse';
          }

          return <Ionicons name={iconName} size={size ?? 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name={TAB_ROUTES.Home} component={TodayScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name={TAB_ROUTES.WorkoutPlans}
        component={WorkoutPlansScreen}
        options={{ title: 'Plans', tabBarLabel: 'Workout Plans' }}
      />
      <Tab.Screen name={TAB_ROUTES.History} component={HistoryScreen} options={{ title: 'History' }} />
      <Tab.Screen name={TAB_ROUTES.Settings} component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
