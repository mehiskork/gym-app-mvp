import React, { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Text } from '../ui/Text';
import { tokens } from '../theme/tokens';
import { createCustomExercise } from '../db/exerciseRepo';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateExercise'>;

export function CreateExerciseScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    try {
      setSaving(true);
      setError(null);
      createCustomExercise(name);
      navigation.goBack();
    } catch {
      setError("Couldn't save changes. Try again.");
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
        {error ? <Text color={tokens.colors.danger}>{error}</Text> : null}
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
