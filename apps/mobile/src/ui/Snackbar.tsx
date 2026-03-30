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

  icon?: React.ReactNode;
  minHeight?: number;
  style?: ViewStyle;
};

export function Snackbar(props: SnackbarProps) {
  const { visible, message, actionLabel, onAction, icon, minHeight, style } = props;
  if (!visible) return null;

  return (
    <View style={[styles.container, minHeight ? { minHeight } : null, style]}>
      <View style={styles.content}>
        {icon ?? (
          <View style={styles.icon}>
            <Ionicons name="trash-outline" size={16} color={tokens.colors.destructive} />
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
    </View>
  );
}

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
  actionPressed: {
    opacity: 0.85,
  },
  actionText: {
    color: tokens.colors.primary,
    fontWeight: tokens.typography.subtitle.fontWeight,
  },
});
