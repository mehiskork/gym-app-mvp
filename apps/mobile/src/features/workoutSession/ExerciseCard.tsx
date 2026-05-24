import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card, Text } from '../../ui';
import { tokens } from '../../theme/tokens';
import {
  SET_ACTIONS_GAP,
  SET_ACTIONS_WIDTH,
  SET_INPUT_GAP,
  SET_NUMBER_COLUMN_WIDTH,
  SET_ROW_GAP,
} from './setRowLayout';

type ExerciseCardProps = {
  name: string;
  subtitle?: string | null;
  onAddSet: () => void;
  onCommentPress?: () => void;
  commentButtonLabel?: 'Add comment' | 'View comment';
  commentDisabled?: boolean;
  addSetDisabled?: boolean;
  onPressTitle?: () => void;
  onSwap?: () => void;
  showAddSet?: boolean;
  showSetHeaders?: boolean;
  children: ReactNode;
};

export function ExerciseCard({
  name,
  subtitle,
  onAddSet,
  onCommentPress,
  commentButtonLabel = 'Add comment',
  commentDisabled = false,
  addSetDisabled = false,
  onPressTitle,
  onSwap,
  showAddSet = true,
  showSetHeaders = true,
  children,
}: ExerciseCardProps) {
  const hasSets = React.Children.count(children) > 0;

  return (
    <Card style={{ gap: tokens.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.md }}>
        <View style={{ flex: 1, gap: tokens.spacing.xs }}>
          <Pressable
            onPress={onPressTitle}
            style={({ pressed }) => [pressed ? { opacity: 0.85 } : null]}
          >
            <Text variant="subtitle">{name}</Text>
          </Pressable>
          {subtitle ? (
            <Text variant="muted" style={{ lineHeight: 18 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onSwap ? (
          <Pressable
            onPress={onSwap}
            accessibilityLabel={`Swap ${name}`}
            style={({ pressed }) => [
              {
                minHeight: 32,
                paddingHorizontal: tokens.spacing.sm,
                backgroundColor: tokens.colors.surface,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                borderRadius: tokens.radius.sm,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: tokens.spacing.xs,
              },
              pressed ? { opacity: 0.8 } : null,
            ]}
          >
            <Ionicons
              name="swap-horizontal"
              size={14}
              color={tokens.colors.mutedText}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text variant="muted" style={{ fontSize: tokens.typography.caption.fontSize }}>
              Swap
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: tokens.spacing.sm }}>
        {hasSets && showSetHeaders ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: SET_INPUT_GAP,
                minWidth: 0,
              }}
            >
              <View style={{ width: SET_NUMBER_COLUMN_WIDTH, flexShrink: 0, alignItems: 'center' }}>
                <Text
                  variant="label"
                  color={tokens.colors.mutedText}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  style={{
                    fontSize: tokens.typography.caption.fontSize,
                    textAlign: 'center',
                  }}
                >
                  SET
                </Text>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', gap: SET_INPUT_GAP, minWidth: 0 }}>
                <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                  <Text
                    variant="label"
                    color={tokens.colors.mutedText}
                    numberOfLines={1}
                    style={{
                      fontSize: tokens.typography.caption.fontSize,
                      textAlign: 'center',
                    }}
                  >
                    WEIGHT
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                  <Text
                    variant="label"
                    color={tokens.colors.mutedText}
                    numberOfLines={1}
                    style={{
                      fontSize: tokens.typography.caption.fontSize,
                      textAlign: 'center',
                    }}
                  >
                    REPS
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={{
                width: SET_ACTIONS_WIDTH,
                marginLeft: SET_ROW_GAP,
                flexDirection: 'row',
                gap: SET_ACTIONS_GAP,
                flexShrink: 0,
              }}
            >
              <View style={{ width: tokens.touchTargetMin }} />
              <View style={{ width: tokens.touchTargetMin }} />
            </View>
          </View>
        ) : null}
        {children}
        <View
          style={{ flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm }}
        >
          <Pressable
            testID="exercise-card-comment"
            onPress={onCommentPress}
            disabled={commentDisabled}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: tokens.touchTargetMin,
                borderWidth: 1,
                borderColor: tokens.colors.border,
                borderRadius: tokens.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: commentDisabled ? 0.6 : 1,
              },
              pressed && !commentDisabled ? { opacity: 0.85 } : null,
            ]}
          >
            <Text variant="muted" color={tokens.colors.mutedText}>
              {commentButtonLabel}
            </Text>
          </Pressable>
          {showAddSet ? (
            <Pressable
              testID="exercise-card-add-set"
              onPress={onAddSet}
              disabled={addSetDisabled}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: tokens.touchTargetMin,
                  borderWidth: 1,
                  borderColor: tokens.colors.border,
                  borderRadius: tokens.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: addSetDisabled ? 0.6 : 1,
                },
                pressed && !addSetDisabled ? { opacity: 0.85 } : null,
              ]}
            >
              <Text variant="muted" color={tokens.colors.mutedText}>
                {addSetDisabled ? 'Max 50 sets' : 'Add Set'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
