import React, { useState } from 'react';
import type { ReactNode } from 'react';
import type { TextInputProps, TextStyle, ViewStyle } from 'react-native';
import { TextInput, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type InputProps = TextInputProps & {
    label?: string;
    helperText?: string;
    errorText?: string;
    leftAccessory?: ReactNode;
    rightAccessory?: ReactNode;
    containerStyle?: ViewStyle;
    inputStyle?: TextStyle;
};

export function Input({
    label,
    helperText,
    errorText,
    leftAccessory,
    rightAccessory,
    containerStyle,
    inputStyle,
    onFocus,
    onBlur,
    placeholderTextColor,
    style,
    ...props
}: InputProps) {
    const [focused, setFocused] = useState(false);

    const handleFocus: TextInputProps['onFocus'] = (event) => {
        setFocused(true);
        onFocus?.(event);
    };

    const handleBlur: TextInputProps['onBlur'] = (event) => {
        setFocused(false);
        onBlur?.(event);
    };

    const message = errorText ?? helperText;
    const messageColor = errorText ? tokens.colors.danger : tokens.colors.mutedText;

    return (
        <View style={{ gap: tokens.spacing.xs }}>
            {label ? (
                <Text variant="label" color={tokens.colors.mutedText}>
                    {label}
                </Text>
            ) : null}
            <View
                style={[
                    {
                        minHeight: tokens.touchTargetMin,
                        paddingHorizontal: tokens.spacing.md,
                        borderRadius: tokens.radius.md,
                        borderWidth: 1,
                        borderColor: focused ? tokens.colors.primary : tokens.colors.border,
                        backgroundColor: tokens.colors.surface,
                        flexDirection: 'row',
                        alignItems: 'center',
                    },
                    containerStyle,
                ]}
            >
                {leftAccessory ? <View style={{ marginRight: tokens.spacing.sm }}>{leftAccessory}</View> : null}
                <TextInput
                    {...props}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholderTextColor={placeholderTextColor ?? tokens.colors.mutedText}
                    style={[
                        tokens.typography.body,
                        { flex: 1, color: tokens.colors.text },
                        style as TextStyle,
                        inputStyle,
                    ]}
                />
                {rightAccessory ? <View style={{ marginLeft: tokens.spacing.sm }}>{rightAccessory}</View> : null}
            </View>
            {message ? (
                <Text variant="muted" color={messageColor} style={tokens.typography.caption}>
                    {message}
                </Text>
            ) : null}
        </View>
    );
}