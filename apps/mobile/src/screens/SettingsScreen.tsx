import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { tokens } from '../theme/tokens';
import { VersionTapUnlock } from '../components/VersionTapUnlock';
import { isDebugUnlocked, setDebugUnlocked } from '../utils/debugUnlock';
import type { RootStackParamList } from '../navigation/types';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [debugUnlocked, setDebugUnlockedState] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const unlocked = await isDebugUnlocked();
      if (active) setDebugUnlockedState(unlocked);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleUnlocked = useCallback(() => {
    setDebugUnlockedState(true);
    navigation.navigate('Debug');
  }, [navigation]);

  const handleLocked = useCallback(() => {
    setDebugUnlocked(false);
    setDebugUnlockedState(false);
  }, []);

  const handleOpenDebug = useCallback(() => {
    navigation.navigate('Debug');
  }, [navigation]);

  return (

    <Screen padded>
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.xl }}>
        <AppText variant="title" style={{ marginBottom: tokens.spacing.lg }}>
          Settings
        </AppText>

        <View
          style={{
            backgroundColor: tokens.colors.surface,
            borderColor: tokens.colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.lg,
            padding: tokens.spacing.lg,
          }}
        >
          <AppText variant="subtitle" style={{ marginBottom: tokens.spacing.md }}>
            About
          </AppText>

          <View style={{ gap: tokens.spacing.sm }}>
            <VersionTapUnlock onUnlocked={handleUnlocked} onLocked={handleLocked} />

            {debugUnlocked ? (
              <Pressable onPress={handleOpenDebug}>
                <AppText color="primary">Open Debug</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}