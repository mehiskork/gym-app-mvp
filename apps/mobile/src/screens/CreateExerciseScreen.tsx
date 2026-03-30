import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
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
    <Screen bottomInset="none" style={{ gap: tokens.spacing.lg }}>
      <View style={{ gap: tokens.spacing.sm }}>
        <Input
          label="Name"
          maxLength={50}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Cable Fly"
          placeholderTextColor={tokens.colors.textSecondary}
          autoFocus
        />
      </View>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            disabled={saving}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Save" onPress={onSave} loading={saving} />
        </View>
      </View>
    </Screen>
  );
}
