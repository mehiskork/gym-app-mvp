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
import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';

const Tab = createBottomTabNavigator<TabParamList>();

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const activeTabBackground = colors.primarySoft.replace(/\d*\.?\d+\)$/, '0.12)');

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleAlign: 'center',
        headerLargeTitle: false,
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: colors.bg,
          elevation: 0,
        },
        sceneContainerStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarActiveBackgroundColor: activeTabBackground,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: tokens.layout.tabBarHeight + insets.bottom,
          paddingTop: tokens.spacing.xs,
          paddingBottom: Math.max(insets.bottom, tokens.spacing.sm),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarItemStyle: {
          marginHorizontal: tokens.spacing.xs,
          marginVertical: tokens.spacing.xs,
          borderRadius: tokens.radius.md,
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
      <Tab.Screen
        name={TAB_ROUTES.History}
        component={HistoryScreen}
        options={{ title: 'History' }}
      />
      <Tab.Screen
        name={TAB_ROUTES.Settings}
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
