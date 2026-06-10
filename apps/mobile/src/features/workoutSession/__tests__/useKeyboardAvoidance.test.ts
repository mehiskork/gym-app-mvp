const mockEffectCleanups: Array<() => void> = [];
let mockStateValues: unknown[] = [];
let mockStateIndex = 0;

jest.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') mockEffectCleanups.push(cleanup);
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = mockStateIndex;
    mockStateIndex += 1;
    const value = index in mockStateValues ? mockStateValues[index] : initial;
    const setValue = jest.fn((next: unknown) => {
      mockStateValues[index] =
        typeof next === 'function' ? (next as (mockCurrent: unknown) => unknown)(value) : next;
    });
    return [value, setValue];
  },
}));

jest.mock('react-native', () => {
  const keyboardHandlers: Record<string, () => void> = {};
  const keyboardRemoveFns: jest.Mock[] = [];
  const keyboardAddListener = jest.fn((event: string, handler: () => void) => {
    keyboardHandlers[event] = handler;
    const remove = jest.fn();
    keyboardRemoveFns.push(remove);
    return { remove };
  });
  const platform = { OS: 'ios', select: jest.fn() };
  const dimensionsGet = jest.fn(() => ({ height: 600 }));

  (
    globalThis as unknown as { __keyboardAvoidanceReactNativeMock: unknown }
  ).__keyboardAvoidanceReactNativeMock = {
    dimensionsGet,
    keyboardAddListener,
    keyboardHandlers,
    keyboardRemoveFns,
    platform,
  };

  return {
    __esModule: true,
    Dimensions: { get: dimensionsGet },
    Keyboard: { addListener: keyboardAddListener },
    Platform: platform,
  };
});

import { getKeyboardAvoidanceScrollTarget, useKeyboardAvoidance } from '../useKeyboardAvoidance';
import { tokens } from '../../../theme/tokens';

function getReactNativeMock() {
  return (
    globalThis as unknown as {
      __keyboardAvoidanceReactNativeMock: {
        dimensionsGet: jest.Mock;
        keyboardAddListener: jest.Mock;
        keyboardHandlers: Record<string, () => void>;
        keyboardRemoveFns: jest.Mock[];
        platform: { OS: string };
      };
    }
  ).__keyboardAvoidanceReactNativeMock;
}

describe('getKeyboardAvoidanceScrollTarget', () => {
  it('returns null when the focused row is already above the keyboard', () => {
    expect(
      getKeyboardAvoidanceScrollTarget({
        metrics: { pageY: 100, height: 40 },
        currentScrollOffset: 20,
        keyboardHeight: 200,
        bottomInset: 12,
        windowHeight: 600,
        platformOS: 'ios',
      }),
    ).toBeNull();
  });

  it('clamps the target to 0 when the calculated target would be negative', () => {
    expect(
      getKeyboardAvoidanceScrollTarget({
        metrics: { pageY: 300, height: 80 },
        currentScrollOffset: -100,
        keyboardHeight: 200,
        bottomInset: 0,
        windowHeight: 600,
        platformOS: 'ios',
      }),
    ).toBe(0);
  });

  it('includes overscroll padding when calculating the target', () => {
    const target = getKeyboardAvoidanceScrollTarget({
      metrics: { pageY: 350, height: 100 },
      currentScrollOffset: 30,
      keyboardHeight: 200,
      bottomInset: 0,
      windowHeight: 600,
      platformOS: 'ios',
    });

    expect(target).toBe(
      30 + 450 - (600 - 200 - tokens.touchTargetMin - tokens.spacing.md) + tokens.spacing.sm,
    );
  });

  it('excludes bottom inset from iOS viewport bottom math', () => {
    const withInset = getKeyboardAvoidanceScrollTarget({
      metrics: { pageY: 350, height: 100 },
      currentScrollOffset: 30,
      keyboardHeight: 200,
      bottomInset: 40,
      windowHeight: 600,
      platformOS: 'ios',
    });
    const withoutInset = getKeyboardAvoidanceScrollTarget({
      metrics: { pageY: 350, height: 100 },
      currentScrollOffset: 30,
      keyboardHeight: 200,
      bottomInset: 0,
      windowHeight: 600,
      platformOS: 'ios',
    });

    expect(withInset).toBe(withoutInset);
  });

  it('includes bottom inset in Android viewport bottom math', () => {
    const withInset = getKeyboardAvoidanceScrollTarget({
      metrics: { pageY: 350, height: 100 },
      currentScrollOffset: 30,
      keyboardHeight: 200,
      bottomInset: 40,
      windowHeight: 600,
      platformOS: 'android',
    });
    const withoutInset = getKeyboardAvoidanceScrollTarget({
      metrics: { pageY: 350, height: 100 },
      currentScrollOffset: 30,
      keyboardHeight: 200,
      bottomInset: 0,
      windowHeight: 600,
      platformOS: 'android',
    });

    expect(withInset).toBe((withoutInset ?? 0) + 40);
  });
});

describe('useKeyboardAvoidance', () => {
  beforeEach(() => {
    const rnMock = getReactNativeMock();
    mockEffectCleanups.length = 0;
    mockStateValues = [];
    mockStateIndex = 0;
    rnMock.keyboardAddListener.mockClear();
    rnMock.keyboardRemoveFns.length = 0;
    Object.keys(rnMock.keyboardHandlers).forEach((key) => delete rnMock.keyboardHandlers[key]);
    rnMock.dimensionsGet.mockClear();
    rnMock.dimensionsGet.mockReturnValue({ height: 600 });
    rnMock.platform.OS = 'ios';
  });

  it('registers iOS keyboard listeners and cleans them up', () => {
    const rnMock = getReactNativeMock();
    useKeyboardAvoidance({ bottomInset: 12 });

    expect(rnMock.keyboardAddListener).toHaveBeenCalledWith(
      'keyboardWillShow',
      expect.any(Function),
    );
    expect(rnMock.keyboardAddListener).toHaveBeenCalledWith(
      'keyboardWillHide',
      expect.any(Function),
    );

    mockEffectCleanups.forEach((cleanup) => cleanup());

    expect(rnMock.keyboardRemoveFns).toHaveLength(2);
    expect(rnMock.keyboardRemoveFns[0]).toHaveBeenCalledTimes(1);
    expect(rnMock.keyboardRemoveFns[1]).toHaveBeenCalledTimes(1);
  });

  it('registers Android keyboard listeners', () => {
    const rnMock = getReactNativeMock();
    rnMock.platform.OS = 'android';

    useKeyboardAvoidance({ bottomInset: 12 });

    expect(rnMock.keyboardAddListener).toHaveBeenCalledWith(
      'keyboardDidShow',
      expect.any(Function),
    );
    expect(rnMock.keyboardAddListener).toHaveBeenCalledWith(
      'keyboardDidHide',
      expect.any(Function),
    );
  });

  it('keeps keyboard spacer closed at zero height', () => {
    const hook = useKeyboardAvoidance({ bottomInset: 12 });

    expect(hook.keyboardOpen).toBe(false);
    expect(hook.keyboardSpacer).toBe(0);
  });

  it('stores scroll offset and uses it when focusing an input with the keyboard open', () => {
    const rnMock = getReactNativeMock();
    mockStateValues = [200];
    const hook = useKeyboardAvoidance({ bottomInset: 12 });
    const scrollTo = jest.fn();
    hook.scrollViewRef.current = { scrollTo } as never;

    hook.handleScroll({ nativeEvent: { contentOffset: { y: 30 } } } as never);
    hook.handleEditFocus({ pageY: 350, height: 100 });

    expect(rnMock.dimensionsGet).toHaveBeenCalledWith('window');
    expect(scrollTo).toHaveBeenCalledWith({
      y: getKeyboardAvoidanceScrollTarget({
        metrics: { pageY: 350, height: 100 },
        currentScrollOffset: 30,
        keyboardHeight: 200,
        bottomInset: 12,
        windowHeight: 600,
        platformOS: 'ios',
      }),
      animated: true,
    });
  });

  it('supports FlatList-style offset tracking and scrolling', () => {
    const rnMock = getReactNativeMock();
    mockStateValues = [200];
    const hook = useKeyboardAvoidance({ bottomInset: 12 });
    const scrollToOffset = jest.fn();
    hook.flatListRef.current = { scrollToOffset } as never;

    hook.handleScrollOffsetChange(30);
    hook.handleEditFocus({ pageY: 350, height: 100 });

    expect(rnMock.dimensionsGet).toHaveBeenCalledWith('window');
    expect(scrollToOffset).toHaveBeenCalledWith({
      offset: getKeyboardAvoidanceScrollTarget({
        metrics: { pageY: 350, height: 100 },
        currentScrollOffset: 30,
        keyboardHeight: 200,
        bottomInset: 12,
        windowHeight: 600,
        platformOS: 'ios',
      }),
      animated: true,
    });
  });
});
