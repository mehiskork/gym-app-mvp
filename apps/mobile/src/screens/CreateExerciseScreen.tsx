import React, { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { createCustomExercise } from '../db/exerciseRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateExercise'>;

export function CreateExerciseScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = () => {
    try {
      setSaving(true);
      createCustomExercise(name);
      navigation.goBack();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create exercise';
      Alert.alert('Error', message);
      setSaving(false);
    }
  };

  return (
    <Screen style={{ gap: tokens.spacing.lg }}>
      <Text variant="title">New Exercise</Text>

      <View style={{ gap: tokens.spacing.sm }}>
        <Text variant="muted">Name</Text>
        <TextInput
          maxLength={50}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Cable Fly"
          placeholderTextColor={tokens.colors.textSecondary}
          autoFocus
          style={{
            minHeight: tokens.touchTargetMin,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: tokens.colors.border,
            paddingHorizontal: tokens.spacing.md,
            color: tokens.colors.text,
            backgroundColor: tokens.colors.surface,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <SecondaryButton title="Cancel" onPress={() => navigation.goBack()} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Save" onPress={onSave} loading={saving} />
        </View>
      </View>
    </Screen>
  );
}
