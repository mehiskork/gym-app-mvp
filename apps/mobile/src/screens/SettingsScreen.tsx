import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BottomSheetModal, Card, ListRow, Screen, Text, ToggleRow } from '../ui';
import { AppText } from '../components/AppText';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { tokens } from '../theme/tokens';
import { VersionTapUnlock } from '../components/VersionTapUnlock';
import { isDebugUnlocked, setDebugUnlocked } from '../utils/debugUnlock';
import type { RootStackParamList } from '../navigation/types';
import { getClaimed } from '../db/appMetaRepo';
import { formatRestCountdown } from '../utils/format';
import { getSettings, updateSettings } from '../db/settingsRepo';

const REST_TIME_OPTIONS = [
  { label: '0:30', seconds: 30 },
  { label: '1:00', seconds: 60 },
  { label: '1:30', seconds: 90 },
  { label: '2:00', seconds: 120 },
  { label: '3:00', seconds: 180 },
  { label: '5:00', seconds: 300 },
];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [debugUnlocked, setDebugUnlockedState] = useState(false);
  const [claimed, setClaimedState] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [restPickerOpen, setRestPickerOpen] = useState(false);

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
      setSettings(getSettings());
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

  const restTimeLabel = useMemo(
    () => formatRestCountdown(settings.defaultRestSeconds),
    [settings.defaultRestSeconds],
  );

  return (
    <Screen padded bottomInset="tabBar">
      <ScrollView contentContainerStyle={{ paddingBottom: tokens.spacing.lg }}>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <PrimaryButton title="Exercises" onPress={() => navigation.navigate('ExercisePicker')} />
        </View>

        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Text variant="subtitle" style={{ marginBottom: tokens.spacing.sm }}>
            Workout settings
          </Text>
          <ListRow
            title="Default Rest Time"
            subtitle="Rest timer duration between sets"
            right={<Text variant="subtitle">{restTimeLabel}</Text>}
            showChevron
            variant="flat"
            onPress={() => setRestPickerOpen(true)}
          />
        </Card>

        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Text variant="subtitle" style={{ marginBottom: tokens.spacing.sm }}>
            Timer & alerts
          </Text>
          <View style={{ gap: tokens.spacing.sm }}>
            <ToggleRow
              title="Auto-start Timer"
              value={settings.autoStartRestTimer}
              onValueChange={(value) =>
                setSettings(updateSettings({ autoStartRestTimer: value }))
              }
              variant="flat"
            />
            <ToggleRow
              title="Keep Screen On"
              value={settings.keepScreenOn}
              onValueChange={(value) => setSettings(updateSettings({ keepScreenOn: value }))}
              variant="flat"
            />
            <ToggleRow
              title="Vibration"
              value={settings.restTimerVibration}
              onValueChange={(value) =>
                setSettings(updateSettings({ restTimerVibration: value }))
              }
              variant="flat"
            />
          </View>
        </Card>

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

        <BottomSheetModal
          visible={restPickerOpen}
          title="Default Rest Time"
          onClose={() => setRestPickerOpen(false)}
        >
          <View style={{ gap: tokens.spacing.sm }}>
            {REST_TIME_OPTIONS.map((option) => (
              <ListRow
                key={option.seconds}
                title={option.label}
                showChevron={false}
                variant="flat"
                right={
                  option.seconds === settings.defaultRestSeconds ? (
                    <Text color="primary">Selected</Text>
                  ) : null
                }
                onPress={() => {
                  setSettings(updateSettings({ defaultRestSeconds: option.seconds }));
                  setRestPickerOpen(false);
                }}
              />
            ))}
          </View>
        </BottomSheetModal>

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
