import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { tokens } from '../theme/tokens';

type Variant = keyof typeof tokens.typography;

type Props = TextProps & {
  variant?: Variant;
  color?: keyof typeof tokens.colors;
  style?: TextStyle | TextStyle[];
};

export function AppText({ variant = 'body', color = 'text', style, ...props }: Props) {
  const baseStyle: TextStyle = {
    color: tokens.colors[color],
    ...(tokens.typography[variant] as TextStyle),
  };

  return <Text {...props} style={[baseStyle, style]} />;
}
