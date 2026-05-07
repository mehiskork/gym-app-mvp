import React from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './Text';
import { tokens } from '../theme/tokens';

type SnackbarProps = {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  variant?: 'info' | 'success' | 'error';

  icon?: React.ReactNode;
  minHeight?: number;
  style?: ViewStyle;
};

export function Snackbar(props: SnackbarProps) {
  const {
    visible,
    message,
    actionLabel,
    onAction,
    onDismiss,
    variant = 'info',
    icon,
    minHeight,
    style,
  } = props;
  if (!visible) return null;

  const variantStyle = stylesByVariant[variant];
  const iconName =
    variant === 'success'
      ? 'checkmark-circle-outline'
      : variant === 'error'
        ? 'alert-circle-outline'
        : 'information-circle-outline';

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        { borderColor: variantStyle.borderColor, backgroundColor: variantStyle.backgroundColor },
        minHeight ? { minHeight } : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ?? (
          <View style={styles.icon}>
            <Ionicons name={iconName} size={16} color={variantStyle.iconColor} />
          </View>
        )}
        <Text variant="body" style={styles.message}>
          {message}
        </Text>
      </View>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.actionButton, pressed ? styles.actionPressed : null]}
          accessibilityRole="button"
        >
          <Text variant="body" style={styles.actionText}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          style={({ pressed }) => [styles.dismissButton, pressed ? styles.actionPressed : null]}
        >
          <Ionicons name="close" size={16} color={tokens.colors.mutedText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const stylesByVariant = {
  info: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    iconColor: tokens.colors.primary,
  },
  success: {
    backgroundColor: tokens.colors.successSurface,
    borderColor: tokens.colors.success,
    iconColor: tokens.colors.success,
  },
  error: {
    backgroundColor: 'rgba(224, 82, 75, 0.16)',
    borderColor: tokens.colors.destructive,
    iconColor: tokens.colors.destructive,
  },
} as const;

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: tokens.colors.bg,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    flex: 1,
  },
  icon: {
    width: tokens.spacing.lg,
    alignItems: 'center',
  },
  message: {
    color: tokens.colors.text,
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
  },
  dismissButton: {
    marginLeft: tokens.spacing.sm,
    padding: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionText: {
    color: tokens.colors.primary,
    fontWeight: tokens.typography.subtitle.fontWeight,
  },
});
