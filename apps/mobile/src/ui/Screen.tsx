import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  scroll?: boolean;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: 'none' | 'tabBar';
};

export function Screen({
  children,
  padded = true,
  scroll = false,
  backgroundColor,
  style,
  contentStyle,
  bottomInset = 'none',
}: ScreenProps) {
  const paddingValue = padded ? tokens.spacing.lg : 0;
  const bottomPadding = bottomInset === 'tabBar' ? tokens.layout.tabBarHeight : 0;
  const baseContentStyle: ViewStyle = {
    paddingHorizontal: paddingValue,
    paddingTop: paddingValue,
    paddingBottom: paddingValue + bottomPadding,
  };
  const bgColor = backgroundColor ?? tokens.colors.bg;
  const edges: Edge[] =
    bottomInset === 'tabBar' ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom'];

  if (scroll) {
    return (
      <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bgColor }, style]}>
        <ScrollView
          contentContainerStyle={[baseContentStyle, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bgColor }, style]}>
      <View style={[{ flex: 1 }, baseContentStyle, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}
