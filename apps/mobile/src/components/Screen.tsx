import React from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';

type Props = ViewProps & {
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function Screen({ padded = true, style, children, ...props }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.colors.background }}>
      <View
        {...props}
        style={[
          { flex: 1, backgroundColor: tokens.colors.background },
          padded ? { padding: tokens.spacing.lg } : null,
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
