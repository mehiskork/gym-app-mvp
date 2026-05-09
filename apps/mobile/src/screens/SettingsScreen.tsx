import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Badge,
  BottomSheetModal,
  Button,
  Card,
  DestructiveConfirmDialog,
  IconChip,
  Input,
  ListRow,
  Screen,
  Snackbar,
  Text,
  ToggleRow,
} from '../ui';
import { tokens } from '../theme/tokens';
import { VersionTapUnlock } from '../components/VersionTapUnlock';
import { isDebugUnlocked, setDebugUnlocked } from '../utils/debugUnlock';
import type { RootStackParamList } from '../navigation/types';
import { formatRestCountdown } from '../utils/format';
import { getSettings, updateSettings } from '../db/settingsRepo';
import { PRIMARY_COLOR_OPTIONS } from '../theme/primaryColors';
import { useAppTheme } from '../theme/theme';
import {
  cancelRestTimerNotification,
  ensureRestTimerNotificationChannel,
  requestRestTimerNotificationPermission,
} from '../utils/restTimerNotifications';
import {
  getUnfinishedWorkoutRemindersPreference,
  setUnfinishedWorkoutRemindersPreference,
} from '../utils/unfinishedWorkoutReminderNotifications';
import { resetToGuestBootstrap } from '../auth/identityTransition';
import type { AccountSession } from '../auth/accountSessionStore';
import {
  createGoogleAccountFromGuest,
  reconnectGoogleAccount,
} from '../auth/googleAccountOrchestrator';
import { signOutFromGoogle } from '../auth/firebaseGoogleAuthClient';
import { resolveLocalAccountState, type LocalAccountStateStatus } from '../auth/localAccountState';
import { getSettingsAccountUiState } from './settingsAccountUiState';
import {
  deleteAccountAndResetLocalState,
  getFriendlyAccountDeletionError,
} from '../auth/accountDeletion';
import { getAccountDeletionUrl } from '../api/config';

const REST_TIME_OPTIONS = [
  { label: '0:30', seconds: 30 },
  { label: '1:00', seconds: 60 },
  { label: '1:30', seconds: 90 },
  { label: '2:00', seconds: 120 },
  { label: '3:00', seconds: 180 },
  { label: '5:00', seconds: 300 },
];

type AccountAction = 'create' | 'reconnect' | 'reset' | 'switch';
type DeleteAccountStep = 'review' | 'confirm';

function getFriendlyAccountError(error: unknown, action: AccountAction): string {
  const rawMessage = error instanceof Error ? error.message : '';
  const message = rawMessage.toLowerCase();

  if (message.includes('different account')) {
    return 'This device is linked to a different Google account. Reset this device before switching accounts.';
  }

  if (
    message.includes('securestore') ||
    message.includes('secure store') ||
    message.includes('expo-secure-store')
  ) {
    return "TrainFrame couldn't access secure account storage. Restart the app and try again.";
  }

  if (
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('expired') ||
    message.includes('reauth')
  ) {
    return 'Your account session expired. Reconnect with Google to sync this device.';
  }

  if (message.includes('cancel')) {
    return 'Google sign-in did not finish. Try again.';
  }

  if (action === 'reconnect') {
    return "Couldn't reconnect this Google account. Check your connection and try again.";
  }

  if (action === 'create') {
    return 'Google sign-in did not finish. Try again.';
  }

  return "TrainFrame couldn't reset account data. Restart the app and try again.";
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, primaryColorKey, setPrimaryColorKey } = useAppTheme();
  const selectedSwatchFill = colors.primarySoft.replace(/\d*\.?\d+\)$/, '0.12)');
  const [debugUnlocked, setDebugUnlockedState] = useState(false);
  const [localAccountState, setLocalAccountState] = useState<LocalAccountStateStatus>('guest');
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<DeleteAccountStep>('review');
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [accountDeletionLinkError, setAccountDeletionLinkError] = useState<string | null>(null);
  const [settings, setSettings] = useState(getSettings());
  const [restPickerOpen, setRestPickerOpen] = useState(false);
  const [restNotificationMessage, setRestNotificationMessage] = useState<string | null>(null);
  const [unfinishedReminderEnabled, setUnfinishedReminderEnabled] = useState(
    getUnfinishedWorkoutRemindersPreference(),
  );
  const [unfinishedReminderMessage, setUnfinishedReminderMessage] = useState<string | null>(null);
  const logoutConfirmInFlightRef = useRef(false);

  const refreshAccountState = useCallback(async () => {
    const state = await resolveLocalAccountState();
    setLocalAccountState(state.status);
    setAccountSession(state.accountSession);
  }, []);

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
      void refreshAccountState();
      setSettings(getSettings());
      setUnfinishedReminderEnabled(getUnfinishedWorkoutRemindersPreference());
    }, [refreshAccountState]),
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

  const handleOpenAccountDeletionWeb = useCallback(() => {
    setAccountDeletionLinkError(null);
    void Linking.openURL(getAccountDeletionUrl()).catch(() => {
      setAccountDeletionLinkError('Could not open the account deletion page. Try again later.');
    });
  }, []);

  const restTimeLabel = useMemo(
    () => formatRestCountdown(settings.defaultRestSeconds),
    [settings.defaultRestSeconds],
  );
  const accountUiState = getSettingsAccountUiState(localAccountState, accountSession);

  const handleRestNotificationsToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setRestNotificationMessage(null);
        setSettings(updateSettings({ restTimerNotifications: false }));
        await cancelRestTimerNotification();
        return;
      }

      setRestNotificationMessage(
        'TrainFrame uses notifications only to tell you when a rest timer ends.',
      );
      const granted = await requestRestTimerNotificationPermission();
      if (!granted) {
        setSettings(updateSettings({ restTimerNotifications: false }));
        setRestNotificationMessage(
          'Notifications are off. Enable TrainFrame notifications in Android Settings to get rest timer alerts.',
        );
        return;
      }

      await ensureRestTimerNotificationChannel(settings.restTimerVibration);
      setSettings(updateSettings({ restTimerNotifications: true }));
      setRestNotificationMessage(null);
    },
    [setSettings, settings.restTimerVibration],
  );

  const handleUnfinishedRemindersToggle = useCallback(async (value: boolean) => {
    setUnfinishedReminderEnabled(value);
    setUnfinishedReminderMessage(null);
    await setUnfinishedWorkoutRemindersPreference(value);

    if (value) {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') {
        setUnfinishedReminderMessage(
          'Notifications need to be enabled to receive workout reminders.',
        );
      }
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (accountBusy) return;
    setAccountError(null);
    setLogoutConfirmOpen(true);
  }, [accountBusy]);

  const handleCloseLogoutConfirm = useCallback(() => {
    if (accountBusy) return;
    setLogoutConfirmOpen(false);
  }, [accountBusy]);

  const handleConfirmLogout = useCallback(() => {
    if (accountBusy || logoutConfirmInFlightRef.current) return;
    logoutConfirmInFlightRef.current = true;
    setLogoutConfirmOpen(false);
    void (async () => {
      try {
        setAccountBusy(true);
        setAccountError(null);
        await signOutFromGoogle();
        await resetToGuestBootstrap();
        await refreshAccountState();
      } catch (error) {
        setAccountError(getFriendlyAccountError(error, 'reset'));
      } finally {
        logoutConfirmInFlightRef.current = false;
        setAccountBusy(false);
      }
    })();
  }, [accountBusy, refreshAccountState]);

  const handleSwitchAccount = useCallback(() => {
    Alert.alert(
      'Switch account on this device?',
      'Switching accounts clears local synced data first. Continue to a safe guest state before signing in again?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setAccountBusy(true);
                setAccountError(null);
                await signOutFromGoogle();
                await resetToGuestBootstrap();
                await refreshAccountState();
              } catch (error) {
                setAccountError(getFriendlyAccountError(error, 'switch'));
              } finally {
                setAccountBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [refreshAccountState]);

  const handleCreateGoogleAccount = useCallback(async () => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      await createGoogleAccountFromGuest();
    } catch (error) {
      setAccountError(getFriendlyAccountError(error, 'create'));
    } finally {
      await refreshAccountState();
      setAccountBusy(false);
    }
  }, [refreshAccountState]);

  const handleReconnectGoogleAccount = useCallback(async () => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      await reconnectGoogleAccount();
    } catch (error) {
      setAccountError(getFriendlyAccountError(error, 'reconnect'));
    } finally {
      await refreshAccountState();
      setAccountBusy(false);
    }
  }, [refreshAccountState]);

  const handleOpenDeleteAccount = useCallback(() => {
    if (accountBusy) return;
    setAccountError(null);
    setDeleteAccountStep('review');
    setDeleteAccountConfirmText('');
    setDeleteAccountOpen(true);
  }, [accountBusy]);

  const handleCloseDeleteAccount = useCallback(() => {
    if (accountBusy) return;
    setDeleteAccountOpen(false);
    setDeleteAccountStep('review');
    setDeleteAccountConfirmText('');
  }, [accountBusy]);

  const handleDeleteAccount = useCallback(async () => {
    if (accountBusy || deleteAccountConfirmText.trim() !== 'DELETE') {
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    try {
      await deleteAccountAndResetLocalState();
      setDeleteAccountOpen(false);
      setDeleteAccountStep('review');
      setDeleteAccountConfirmText('');
      await refreshAccountState();
    } catch (error) {
      setAccountError(getFriendlyAccountDeletionError(error));
    } finally {
      setAccountBusy(false);
    }
  }, [accountBusy, deleteAccountConfirmText, refreshAccountState]);

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
            onValueChange={(value) => setSettings(updateSettings({ autoStartRestTimer: value }))}
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
            onValueChange={(value) => setSettings(updateSettings({ restTimerVibration: value }))}
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
          {restNotificationMessage ? <Text variant="muted">{restNotificationMessage}</Text> : null}
          <ToggleRow
            title="Unfinished workout reminders"
            subtitle="Remind me if I leave a logged workout unfinished."
            value={unfinishedReminderEnabled}
            onValueChange={(value) => {
              void handleUnfinishedRemindersToggle(value);
            }}
            variant="flat"
          />
          {unfinishedReminderMessage ? (
            <Text variant="muted">{unfinishedReminderMessage}</Text>
          ) : null}
        </View>
      </Card>

      <Card>
        <Text variant="subtitle" style={{ marginBottom: tokens.spacing.sm }}>
          Appearance
        </Text>
        <Text variant="muted" style={{ marginBottom: tokens.spacing.sm }}>
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
                  minWidth: 90,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1,
                  borderColor: selected ? option.primaryBorder : colors.border,
                  backgroundColor: selected ? selectedSwatchFill : colors.surface2,
                  paddingVertical: tokens.spacing.xs,
                  paddingHorizontal: tokens.spacing.sm,
                  gap: tokens.spacing.xs,
                  minHeight: 62,
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: option.primary,
                    }}
                  />
                  {selected ? (
                    <View
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: option.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="checkmark" size={10} color={option.primaryTextOnColor} />
                    </View>
                  ) : null}
                </View>
                <Text variant="body" style={{ color: colors.text, fontSize: 12 }}>
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
            backgroundColor: colors.surface,
            padding: tokens.spacing.md,
            gap: tokens.spacing.sm,
          }}
        >
          <Text variant="label" color={colors.mutedText}>
            Live preview
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Start Workout" size="sm" />
            </View>
            <Badge label="PR" variant="pr" />
            <IconChip variant="primarySoft" size={40}>
              <Ionicons name="barbell" size={18} color={colors.primary} />
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
        {accountUiState.showGuestCreate ? (
          <>
            <Text color={colors.textSecondary}>Using guest mode</Text>
            <Text variant="muted">
              Your workout data is saved on this device. Sign in with Google to sync it and keep it
              safe if you change phones.
            </Text>
          </>
        ) : (
          <Text color={colors.textSecondary}>
            {accountUiState.showAccountActions
              ? `Signed in as ${accountUiState.accountLabel}`
              : accountUiState.accountLabel}
          </Text>
        )}
        {accountUiState.showReauthRequired ? (
          <Text variant="muted">{accountUiState.reauthMessage}</Text>
        ) : null}
        {accountError ? (
          <Snackbar visible message={accountError} variant="error" minHeight={44} />
        ) : null}
        {accountUiState.showReconnect ? (
          <>
            <Button
              title="Reconnect with Google"
              onPress={handleReconnectGoogleAccount}
              loading={accountBusy}
            />
            <Button
              title="Reset this device"
              variant="destructive"
              onPress={handleLogout}
              loading={accountBusy}
            />
          </>
        ) : accountUiState.showAccountActions ? (
          <>
            <Button
              title="Switch account"
              onPress={handleSwitchAccount}
              loading={accountBusy}
              disabled={accountBusy}
            />
            <Button
              title="Sign out"
              variant="destructive"
              onPress={handleLogout}
              loading={accountBusy}
              disabled={accountBusy}
            />
            <Button
              title="Delete account"
              variant="destructive"
              onPress={handleOpenDeleteAccount}
              loading={accountBusy}
              disabled={accountBusy}
            />
          </>
        ) : accountUiState.showGuestCreate ? (
          <>
            <Button
              title="Sign in with Google"
              onPress={handleCreateGoogleAccount}
              loading={accountBusy}
            />
          </>
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

      <BottomSheetModal
        visible={deleteAccountOpen}
        title="Delete account"
        onClose={handleCloseDeleteAccount}
      >
        {deleteAccountStep === 'review' ? (
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="body">
              This permanently deletes your TrainFrame account data from the server and resets this
              device.
            </Text>
            <Text variant="muted">
              This does not delete your Google account. Local app data on this device will be reset
              only after server deletion succeeds. If deletion fails, no local data will be removed.
            </Text>
            <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={handleCloseDeleteAccount}
                  disabled={accountBusy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Continue"
                  variant="destructive"
                  onPress={() => setDeleteAccountStep('confirm')}
                  disabled={accountBusy}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ gap: tokens.spacing.md }}>
            <Text variant="body">
              This cannot be undone. Type DELETE to permanently delete your TrainFrame account data.
            </Text>
            <Input
              value={deleteAccountConfirmText}
              onChangeText={setDeleteAccountConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              editable={!accountBusy}
              helperText="Required to confirm account deletion."
            />
            <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Back"
                  variant="secondary"
                  onPress={() => setDeleteAccountStep('review')}
                  disabled={accountBusy}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={accountBusy ? 'Deleting...' : 'Delete account'}
                  variant="destructive"
                  onPress={handleDeleteAccount}
                  loading={accountBusy}
                  disabled={accountBusy || deleteAccountConfirmText.trim() !== 'DELETE'}
                />
              </View>
            </View>
          </View>
        )}
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
          <Pressable onPress={handleOpenAccountDeletionWeb}>
            <Text color={colors.primary}>Account deletion request</Text>
          </Pressable>
          {accountDeletionLinkError ? (
            <Snackbar visible message={accountDeletionLinkError} variant="error" minHeight={44} />
          ) : null}
        </View>
      </View>
      <DestructiveConfirmDialog
        visible={logoutConfirmOpen}
        title="Log out and clear local data?"
        body="This device will sign out and remove local synced data so another account cannot inherit it."
        cancelLabel="Cancel"
        confirmLabel="Log out"
        onClose={handleCloseLogoutConfirm}
        onConfirm={handleConfirmLogout}
        testID="logout-confirm-dialog"
      />
    </Screen>
  );
}
