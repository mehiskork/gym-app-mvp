import type { TabParamList } from './types';

type TabRouteName = keyof TabParamList;

export const TAB_ROUTES = {
  Home: 'Home',
  WorkoutPlans: 'WorkoutPlans',
  History: 'History',
  Settings: 'Settings',
} as const satisfies Record<TabRouteName, TabRouteName>;
