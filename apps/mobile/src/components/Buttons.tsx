import React from 'react';
import { Pressable, ActivityIndicator, type PressableProps, type ViewStyle } from 'react-native';
import { tokens } from '../theme/tokens';
import { AppText } from './AppText';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  loading?: boolean;
  disabled?: boolean;
};

function baseStyle(disabled?: boolean): ViewStyle {
  return {
    minHeight: tokens.touchTargetMin,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    opacity: disabled ? 0.6 : 1,
  };
}

export function PrimaryButton({ title, loading, disabled, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        baseStyle(isDisabled),
        { backgroundColor: tokens.colors.primary },
        pressed && !isDisabled ? { opacity: 0.85 } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <AppText variant="subtitle" style={{ color: tokens.colors.primaryText }}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ title, loading, disabled, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        baseStyle(isDisabled),
        {
          backgroundColor: tokens.colors.surface,
          borderWidth: 1,
          borderColor: tokens.colors.border,
        },
        pressed && !isDisabled ? { opacity: 0.85 } : null,
      ]}
    >
      {loading ? <ActivityIndicator /> : <AppText variant="subtitle">{title}</AppText>}
    </Pressable>
  );
}
