import React from 'react';
import type { TextProps, TextStyle } from 'react-native';
import { Platform, Text as RNText } from 'react-native';

import { tokens } from '../theme/tokens';

type Variant = 'title' | 'h2' | 'subtitle' | 'body' | 'muted' | 'label' | 'mono';

type AppTextProps = TextProps & {
    variant?: Variant;
    weight?: TextStyle['fontWeight'];
    color?: string;
};

export function Text({ variant = 'body', weight, color, style, ...props }: AppTextProps) {
    const baseStyle = variant === 'muted' ? tokens.typography.body : tokens.typography[variant];
    const resolvedColor = color ?? (variant === 'muted' ? tokens.colors.mutedText : tokens.colors.text);
    const monoStyle: TextStyle | null =
        variant === 'mono'
            ? {
                fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
                letterSpacing: 0.3,
            }
            : null;

    return (
        <RNText
            {...props}
            style={[baseStyle, monoStyle, { color: resolvedColor }, weight ? { fontWeight: weight } : null, style]}
        />
    );
}