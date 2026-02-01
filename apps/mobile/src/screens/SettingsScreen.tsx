import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../ui';
import { AppText } from '../components/AppText';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { VersionTapUnlock } from '../components/VersionTapUnlock';
import { isDebugUnlocked, setDebugUnlocked } from '../utils/debugUnlock';
import type { RootStackParamList } from '../navigation/types';
import { getClaimed } from '../db/appMetaRepo';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [debugUnlocked, setDebugUnlockedState] = useState(false);
  const [claimed, setClaimedState] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      setClaimedState(getClaimed());
    }, []),
  );


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
    <Screen padded bottomInset="tabBar">
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.lg }}>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <PrimaryButton title="Exercises" onPress={() => navigation.navigate('ExercisePicker')} />
        </View>

        <View
          style={{
            backgroundColor: tokens.colors.surface,
            borderColor: tokens.colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.lg,
            padding: tokens.spacing.lg,
            marginBottom: tokens.spacing.lg,
            gap: tokens.spacing.sm,
          }}
        >
          <AppText variant="subtitle">Account</AppText>
          <AppText color="textSecondary">
            Account: {claimed ? 'Linked' : 'Guest'}
          </AppText>
          <PrimaryButton title="Link to account" onPress={() => navigation.navigate('ClaimStart')} />
          {debugUnlocked ? (
            <SecondaryButton
              title="Dev: Confirm claim"
              onPress={() => navigation.navigate('ClaimConfirm')}
            />
          ) : null}
        </View>

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
