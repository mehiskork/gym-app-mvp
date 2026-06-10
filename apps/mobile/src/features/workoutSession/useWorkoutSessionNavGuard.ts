import { useCallback, useRef } from 'react';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { TAB_ROUTES } from '../../navigation/routes';
import type { RootStackParamList } from '../../navigation/types';

export type WorkoutSessionNavGuardNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList, 'WorkoutSession'>,
  'dispatch' | 'addListener'
>;

const BACK_ACTION_TYPES = ['GO_BACK', 'POP', 'POP_TO_TOP'];

export function useWorkoutSessionNavGuard({
  navigation,
  onBeforeExit,
}: {
  navigation: WorkoutSessionNavGuardNavigation;
  onBeforeExit?: () => void;
}): { resetToHome: () => void } {
  const isExitingToHomeRef = useRef(false);

  const resetToHome = useCallback(() => {
    if (isExitingToHomeRef.current) return;
    isExitingToHomeRef.current = true;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      }),
    );
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('beforeRemove', (e) => {
        if (!BACK_ACTION_TYPES.includes(e.data.action.type)) return;
        e.preventDefault();
        onBeforeExit?.();
        resetToHome();
      });
      return unsubscribe;
    }, [navigation, onBeforeExit, resetToHome]),
  );

  return { resetToHome };
}
