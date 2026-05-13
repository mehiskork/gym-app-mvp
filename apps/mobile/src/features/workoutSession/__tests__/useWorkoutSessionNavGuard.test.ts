const mockRefs: Array<{ current: unknown }> = [];
const mockFocusCleanups: Array<() => void> = [];

jest.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (initial: unknown) => {
    const ref = { current: initial };
    mockRefs.push(ref);
    return ref;
  },
}));

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    reset: jest.fn((payload: unknown) => ({ type: 'RESET', payload })),
  },
  useFocusEffect: jest.fn((callback: () => void | (() => void)) => {
    const cleanup = callback();
    if (typeof cleanup === 'function') mockFocusCleanups.push(cleanup);
  }),
}));

import { CommonActions } from '@react-navigation/native';

import { TAB_ROUTES } from '../../../navigation/routes';
import { useWorkoutSessionNavGuard } from '../useWorkoutSessionNavGuard';
import type { WorkoutSessionNavGuardNavigation } from '../useWorkoutSessionNavGuard';

type BeforeRemoveEvent = {
  data: { action: { type: string } };
  preventDefault: jest.Mock;
};

function createNavigation() {
  let beforeRemoveHandler: ((event: BeforeRemoveEvent) => void) | undefined;
  const unsubscribe = jest.fn();
  const navigation = {
    addListener: jest.fn((event: string, handler: unknown) => {
      if (event === 'beforeRemove') {
        beforeRemoveHandler = handler as (event: BeforeRemoveEvent) => void;
      }
      return unsubscribe;
    }),
    dispatch: jest.fn(),
  } as unknown as WorkoutSessionNavGuardNavigation & {
    addListener: jest.Mock;
    dispatch: jest.Mock;
  };

  return {
    getBeforeRemoveHandler: () => beforeRemoveHandler,
    navigation,
    unsubscribe,
  };
}

function createBeforeRemoveEvent(type: string): BeforeRemoveEvent {
  return {
    data: { action: { type } },
    preventDefault: jest.fn(),
  };
}

describe('useWorkoutSessionNavGuard', () => {
  beforeEach(() => {
    mockRefs.length = 0;
    mockFocusCleanups.length = 0;
    (CommonActions.reset as jest.Mock).mockClear();
  });

  it('resetToHome dispatches the exact Home reset payload', () => {
    const { navigation } = createNavigation();
    const { resetToHome } = useWorkoutSessionNavGuard({ navigation });

    resetToHome();

    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      },
    });
  });

  it('resetToHome dispatches only once when called repeatedly', () => {
    const { navigation } = createNavigation();
    const { resetToHome } = useWorkoutSessionNavGuard({ navigation });

    resetToHome();
    resetToHome();

    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
  });

  it('registers beforeRemove on focus and cleans up the listener', () => {
    const { navigation, unsubscribe } = createNavigation();

    useWorkoutSessionNavGuard({ navigation });

    expect(navigation.addListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));
    expect(mockFocusCleanups).toHaveLength(1);

    mockFocusCleanups[0]?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it.each(['GO_BACK', 'POP', 'POP_TO_TOP'])(
    'intercepts %s, prevents default, and resets Home',
    (actionType) => {
      const { getBeforeRemoveHandler, navigation } = createNavigation();
      useWorkoutSessionNavGuard({ navigation });
      const event = createBeforeRemoveEvent(actionType);

      getBeforeRemoveHandler()?.(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(navigation.dispatch).toHaveBeenCalledTimes(1);
      expect(CommonActions.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: TAB_ROUTES.Home } }],
      });
    },
  );

  it.each(['NAVIGATE', 'REPLACE'])(
    'allows %s through without preventing default or resetting',
    (actionType) => {
      const { getBeforeRemoveHandler, navigation } = createNavigation();
      useWorkoutSessionNavGuard({ navigation });
      const event = createBeforeRemoveEvent(actionType);

      getBeforeRemoveHandler()?.(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(CommonActions.reset).not.toHaveBeenCalled();
    },
  );

  it('prevents duplicate reset across direct reset and guarded beforeRemove', () => {
    const { getBeforeRemoveHandler, navigation } = createNavigation();
    const { resetToHome } = useWorkoutSessionNavGuard({ navigation });

    resetToHome();
    const event = createBeforeRemoveEvent('GO_BACK');
    getBeforeRemoveHandler()?.(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(CommonActions.reset).toHaveBeenCalledTimes(1);
  });
});
