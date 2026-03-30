jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useEffect: jest.fn((fn: () => (() => void) | void) => fn()),
    useState: jest.fn((initial: unknown) => [initial, jest.fn()]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  const keyboard = {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };

  return {
    Keyboard: keyboard,
    KeyboardAvoidingView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('KeyboardAvoidingView', props, children),
    Modal: ({ children, visible, ...props }: { children?: React.ReactNode; visible?: boolean }) =>
      visible ? React.createElement('Modal', props, children) : null,
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    useWindowDimensions: () => ({ width: 360, height: 800, scale: 2, fontScale: 1 }),
    StyleSheet: {
      absoluteFillObject: {},
    },
    Platform: { OS: 'ios' },
  };
});

import React from 'react';
import { Keyboard, Platform } from 'react-native';

import {
  BottomSheetModal,
  getAndroidKeyboardOffsetFromVisibleArea,
  getSheetKeyboardOffset,
} from '../BottomSheetModal';

describe('BottomSheetModal keyboard behavior', () => {
  beforeEach(() => {
    (Keyboard.addListener as jest.Mock).mockClear();
  });

  it('computes sheet offset from keyboard height and inset', () => {
    expect(getSheetKeyboardOffset(300, 20)).toBe(280);
    expect(getSheetKeyboardOffset(10, 20)).toBe(0);
  });

  it('computes Android offset from actual visible area', () => {
    expect(getAndroidKeyboardOffsetFromVisibleArea(800, 500)).toBe(300);
    expect(getAndroidKeyboardOffsetFromVisibleArea(800, undefined)).toBe(0);
  });

  it('subscribes to iOS keyboard show/hide events when keyboardAware', () => {
    Platform.OS = 'ios';

    BottomSheetModal({
      visible: true,
      title: 'Comment',
      onClose: jest.fn(),
      keyboardAware: true,
      children: React.createElement('View'),
    });

    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));
  });

  it('subscribes to Android keyboard show/hide events when keyboardAware', () => {
    Platform.OS = 'android';

    BottomSheetModal({
      visible: true,
      title: 'Comment',
      onClose: jest.fn(),
      keyboardAware: true,
      children: React.createElement('View'),
    });

    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    expect(Keyboard.addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
  });
});
