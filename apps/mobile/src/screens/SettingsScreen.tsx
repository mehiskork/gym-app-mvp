import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Badge, BottomSheetModal, Button, Card, IconChip, ListRow, Screen, Text, ToggleRow } from '../ui';
import { tokens } from '../theme/tokens';
import { VersionTapUnlock } from '../components/VersionTapUnlock';
import { isDebugUnlocked, setDebugUnlocked } from '../utils/debugUnlock';
import type { RootStackParamList } from '../navigation/types';
import { getClaimed } from '../db/appMetaRepo';
import { formatRestCountdown } from '../utils/format';
import { getSettings, updateSettings } from '../db/settingsRepo';
import { PRIMARY_COLOR_OPTIONS } from '../theme/primaryColors';
import { useAppTheme } from '../theme/theme';
import {
  cancelRestTimerNotification,
  ensureRestTimerNotificationChannel,
  requestRestTimerNotificationPermission,
} from '../utils/restTimerNotifications';

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
  const { colors, primaryColorKey, setPrimaryColorKey } = useAppTheme();
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

  const handleRestNotificationsToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setSettings(updateSettings({ restTimerNotifications: false }));
        await cancelRestTimerNotification();
        return;
      }

      const granted = await requestRestTimerNotificationPermission();
      if (!granted) {
        setSettings(updateSettings({ restTimerNotifications: false }));
        Alert.alert(
          'Notifications disabled',
          'Enable notifications in Settings to get silent rest timer alerts.',
        );
        return;
      }

      await ensureRestTimerNotificationChannel();
      setSettings(updateSettings({ restTimerNotifications: true }));
    },
    [setSettings],
  );

  return (
    <Screen
      scroll
      padded={false}
      bottomInset="tabBar"
      contentStyle={{
        gap: tokens.spacing.lg,
        paddingHorizontal: tokens.spacing.lg,
        paddingTop: tokens.spacing.xs,
      }}
    >
      <Button title="Exercises" onPress={() => navigation.navigate('ExercisePicker')} />

      <Card>
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

      <Card>
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
          <ToggleRow
            title="Rest notifications"
            subtitle="Show a notification when rest ends (silent)"
            value={settings.restTimerNotifications}
            onValueChange={(value) => {
              void handleRestNotificationsToggle(value);
            }}
            variant="flat"
          />
        </View>
      </Card>

      <Card>
        <Text variant="subtitle" style={{ marginBottom: tokens.spacing.sm }}>
          Appearance
        </Text>
        <Text variant="muted" style={{ marginBottom: tokens.spacing.md }}>
          Primary Color
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
          {PRIMARY_COLOR_OPTIONS.map((option) => {
            const selected = option.key === primaryColorKey;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  setPrimaryColorKey(option.key);
                  setSettings((current) => ({ ...current, primaryColorKey: option.key }));
                }}
                style={{
                  width: '31%',
                  minWidth: 92,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1,
                  borderColor: selected ? option.value : colors.border,
                  backgroundColor: colors.surface2,
                  paddingVertical: tokens.spacing.sm,
                  paddingHorizontal: tokens.spacing.sm,
                  gap: tokens.spacing.sm,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: option.value,
                    borderWidth: 1,
                    borderColor: selected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <Ionicons name="checkmark" size={14} color={option.onPrimary} /> : null}
                </View>
                <Text variant="body" style={{ color: colors.text }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            marginTop: tokens.spacing.md,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface2,
            padding: tokens.spacing.md,
            gap: tokens.spacing.sm,
          }}
        >
          <Text variant="label" color={colors.mutedText}>
            Live preview
          </Text>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Button title="Primary Button" size="sm" />
            </View>
            <Badge label="Chip" variant="goal" />
            <IconChip variant="primarySolid" size={40}>
              <Ionicons name="home" size={18} color={colors.onPrimary} />
            </IconChip>
          </View>
        </View>
      </Card>

      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: tokens.radius.lg,
          padding: tokens.spacing.lg,
          gap: tokens.spacing.sm,
        }}
      >
        <Text variant="subtitle">Account</Text>
        <Text color={colors.textSecondary}>
          Account: {claimed ? 'Linked' : 'Guest'}
        </Text>
        <Button title="Link to account" onPress={() => navigation.navigate('ClaimStart')} />
        {debugUnlocked ? (
          <Button
            title="Dev: Confirm claim"
            variant="secondary"
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
                  <Text color={colors.primary}>Selected</Text>
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
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: tokens.radius.lg,
          padding: tokens.spacing.lg,
        }}
      >
        <Text variant="subtitle" style={{ marginBottom: tokens.spacing.md }}>
          About
        </Text>

        <View style={{ gap: tokens.spacing.sm }}>
          <VersionTapUnlock onUnlocked={handleUnlocked} onLocked={handleLocked} />

          {debugUnlocked ? (
            <Pressable onPress={handleOpenDebug}>
              <Text color={colors.primary}>Open Debug</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
