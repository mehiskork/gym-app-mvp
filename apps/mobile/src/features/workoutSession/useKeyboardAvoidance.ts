import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import type { FlatList as GestureFlatList } from 'react-native-gesture-handler';

import { tokens } from '../../theme/tokens';

export type EditFocusMetrics = { pageY: number; height: number };

export function getKeyboardAvoidanceScrollTarget(input: {
  metrics: EditFocusMetrics;
  currentScrollOffset: number;
  keyboardHeight: number;
  bottomInset: number;
  windowHeight: number;
  platformOS: typeof Platform.OS;
}): number | null {
  const { metrics, currentScrollOffset, keyboardHeight, bottomInset, windowHeight, platformOS } =
    input;
  const viewportBottom =
    (platformOS === 'ios' ? 0 : bottomInset) + tokens.touchTargetMin + tokens.spacing.md;
  const visibleBottom = metrics.pageY + metrics.height;
  const keyboardTop = windowHeight - keyboardHeight - viewportBottom;
  if (visibleBottom <= keyboardTop) return null;
  const neededOffset = visibleBottom - keyboardTop + tokens.spacing.sm;
  return Math.max(0, currentScrollOffset + neededOffset);
}

export function useKeyboardAvoidance<ItemT = unknown>({ bottomInset }: { bottomInset: number }) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const flatListRef = useRef<GestureFlatList<ItemT> | null>(null);
  const scrollOffsetYRef = useRef(0);
  const activeRowMetricsRef = useRef<EditFocusMetrics | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOpen = keyboardHeight > 0;
  const keyboardSpacer = keyboardOpen ? keyboardHeight + tokens.spacing.lg : 0;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleScrollOffsetChange = useCallback((offset: number) => {
    scrollOffsetYRef.current = offset;
  }, []);

  const handleEditFocus = useCallback(
    (metrics: EditFocusMetrics) => {
      activeRowMetricsRef.current = metrics;
      if (!keyboardOpen) return;
      const targetY = getKeyboardAvoidanceScrollTarget({
        metrics,
        currentScrollOffset: scrollOffsetYRef.current,
        keyboardHeight,
        bottomInset,
        windowHeight: Dimensions.get('window').height,
        platformOS: Platform.OS,
      });
      if (targetY === null) return;
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          y: targetY,
          animated: true,
        });
        return;
      }
      flatListRef.current?.scrollToOffset({
        offset: targetY,
        animated: true,
      });
    },
    [bottomInset, keyboardHeight, keyboardOpen],
  );

  useEffect(() => {
    if (!keyboardOpen || !activeRowMetricsRef.current) return;
    handleEditFocus(activeRowMetricsRef.current);
  }, [handleEditFocus, keyboardOpen]);

  return {
    scrollViewRef,
    flatListRef,
    handleScroll,
    handleScrollOffsetChange,
    handleEditFocus,
    keyboardOpen,
    keyboardSpacer,
  };
}
