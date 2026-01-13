import React from 'react';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';

export function SettingsScreen() {
  return (
    <Screen style={{ justifyContent: 'center' }}>
      <AppText variant="title">Settings</AppText>
    </Screen>
  );
}
