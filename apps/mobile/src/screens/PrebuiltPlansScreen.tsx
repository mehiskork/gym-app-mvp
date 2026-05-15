import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Text } from '../ui';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import { listPrebuiltPlans } from '../db/prebuiltPlansRepo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PrebuiltPlansScreen() {
  const navigation = useNavigation<Nav>();

  const [templates, setTemplates] = useState(() => listPrebuiltPlans());

  const loadTemplates = useCallback(() => {
    setTemplates(listPrebuiltPlans());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [loadTemplates]),
  );

  const handlePreview = (templateId: string) => {
    navigation.navigate('PrebuiltPlanPreview', { templateId });
  };

  const formatSessionCount = (dayCount: number) =>
    `${dayCount} session${dayCount === 1 ? '' : 's'}`;

  return (
    <Screen bottomInset="none">
      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: tokens.spacing.sm }} />}
        ListEmptyComponent={<Text variant="muted">No templates available.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handlePreview(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${item.name}`}
            style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
          >
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: tokens.spacing.sm,
                  padding: tokens.spacing.md,
                  backgroundColor: tokens.colors.surface,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1,
                  borderColor: tokens.colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: tokens.spacing.xs }}>
                <Text variant="subtitle">{item.name}</Text>
                {item.description ? <Text variant="muted">{item.description}</Text> : null}
                <Text variant="muted">{formatSessionCount(item.dayCount)}</Text>
              </View>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={tokens.colors.mutedText}
              />
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
