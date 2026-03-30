import React from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { tokens } from '../theme/tokens';
import { Text } from './Text';

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: tokens.radius.xl,
          backgroundColor: tokens.colors.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ alignItems: 'center', gap: tokens.spacing.xs }}>
        <Text variant="subtitle">{title}</Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {description}
        </Text>
      </View>
      {action ? <View style={{ marginTop: tokens.spacing.sm }}>{action}</View> : null}
    </View>
  );
}
