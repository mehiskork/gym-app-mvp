import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useAppTheme } from '../theme/theme';
import { tokens } from '../theme/tokens';

type Variant = 'primarySolid' | 'primarySoft' | 'muted';

type IconChipProps = {
  children: ReactNode;
  variant?: Variant;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const sizeStyles: Record<number, ViewStyle> = {
  40: { width: 40, height: 40, borderRadius: tokens.radius.lg },
  44: { width: 44, height: 44, borderRadius: tokens.radius.lg },
  56: { width: 56, height: 56, borderRadius: tokens.radius.xl },
};

export function IconChip({ children, variant = 'muted', size = 44, style }: IconChipProps) {
  const { colors } = useAppTheme();
  const variantStyles: Record<Variant, ViewStyle> = {
    primarySolid: {
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    primarySoft: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    muted: {
      backgroundColor: colors.surface2,
    },
  };
  const baseStyle: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <View style={[baseStyle, sizeStyles[size] ?? sizeStyles[44], variantStyles[variant], style]}>
      {children}
    </View>
  );
}
