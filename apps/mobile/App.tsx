import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { runMigrations } from './src/db/migrate';
import { TransactionRollbackError } from './src/db/tx';
import { RootNavigator } from './src/navigation/RootNavigator';
import { seedCuratedExercises } from './src/db/curatedExerciseSeed';
import { repairStaleInFlightOps } from './src/db/outboxRepo';
import { ThemeProvider } from './src/theme/theme';
import { tokens } from './src/theme/tokens';
import { ensureRestTimerNotificationChannel } from './src/utils/restTimerNotifications';
import { Button } from './src/ui/Button';
import { Text } from './src/ui/Text';
import { DestructiveConfirmDialog } from './src/ui/DestructiveConfirmDialog';
import { resetToGuestBootstrap } from './src/auth/identityTransition';
import { recoverInterruptedIdentityResetPause } from './src/auth/syncQuiescence';
import { scheduleForegroundSync, scheduleStartupSync } from './src/sync/syncScheduler';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { logEvent } from './src/utils/logger';
import { reconcileUnfinishedWorkoutReminder } from './src/utils/unfinishedWorkoutReminderNotifications';
import {
  hasPendingAccountDeletionCleanupMarker,
  hasPendingAccountDeletionRecovery,
  recoverAccountDeletionAfterStartup,
} from './src/auth/accountDeletion';

type BootState =
  | { kind: 'initializing' }
  | { kind: 'ready' }
  | { kind: 'failed'; error: Error }
  | { kind: 'accountDeletionRecoveryFailed'; error: Error };

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function StartupRecoveryScreen({
  error,
  onRetry,
  onReset,
  accountDeletionRecovery = false,
}: {
  error: Error;
  onRetry: () => void;
  onReset: () => void;
  accountDeletionRecovery?: boolean;
}) {
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const restartRequired = error instanceof TransactionRollbackError && error.restartRequired;

  if (restartRequired) {
    return (
      <View style={styles.recoveryContainer}>
        <Text variant="title" weight="700" style={styles.recoveryTitle}>
          Restart TrainFrame
        </Text>
        <Text variant="body" style={styles.recoveryBody}>
          The app couldn't safely finish a database operation. Close TrainFrame completely and
          reopen it before trying again. Do not uninstall the app or clear its storage; that can
          erase unsynced workouts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.recoveryContainer}>
      <Text variant="title" weight="700" style={styles.recoveryTitle}>
        {accountDeletionRecovery
          ? "Couldn't finish account deletion cleanup"
          : "Couldn't open app data"}
      </Text>
      <Text variant="body" style={styles.recoveryBody}>
        {accountDeletionRecovery
          ? 'TrainFrame deleted or started deleting your server account data, but this device still needs to finish clearing local data before sync can resume.'
          : "The app couldn't finish updating local data. You can try again, or reset local app data and start fresh on this device."}
      </Text>
      <View style={styles.actions}>
        <Button title="Try again" onPress={onRetry} />
        <Button
          title="Reset local data"
          variant="destructive"
          onPress={() => setResetConfirmVisible(true)}
        />
      </View>
      <DestructiveConfirmDialog
        visible={resetConfirmVisible}
        title={
          accountDeletionRecovery
            ? 'Finish account deletion cleanup on this device?'
            : 'Reset local data on this device?'
        }
        body={
          accountDeletionRecovery
            ? 'This clears local TrainFrame data and account credentials on this device. Sync stays off until cleanup completes.'
            : 'This clears local TrainFrame data and account credentials on this device. Synced account data can be restored after reconnecting. Unsynced local changes may be lost.'
        }
        confirmLabel="Reset this device"
        cancelLabel="Cancel"
        onClose={() => setResetConfirmVisible(false)}
        onConfirm={() => {
          setResetConfirmVisible(false);
          onReset();
        }}
      />
      {__DEV__ ? (
        <View style={styles.devDetails}>
          <Text variant="muted" color="#BDBDBD">
            {error.message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [bootState, setBootState] = useState<BootState>({ kind: 'initializing' });
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  const initializeApp = useCallback(() => {
    setBootState({ kind: 'initializing' });

    void (async () => {
      let markerPending = false;
      let accountDeletionRecoveryPending = false;
      try {
        markerPending = await hasPendingAccountDeletionCleanupMarker();
        accountDeletionRecoveryPending = markerPending;
        runMigrations();
        accountDeletionRecoveryPending =
          markerPending || (await hasPendingAccountDeletionRecovery());
        if (accountDeletionRecoveryPending) {
          await recoverAccountDeletionAfterStartup();
        }
        recoverInterruptedIdentityResetPause();
        seedCuratedExercises();
        repairStaleInFlightOps(120);
        if (!accountDeletionRecoveryPending) {
          void reconcileUnfinishedWorkoutReminder().catch((error) => {
            logEvent('warn', 'notifications', 'Unfinished workout reminder reconcile failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        void ensureRestTimerNotificationChannel(false).catch((error) => {
          logEvent('warn', 'notifications', 'Rest notification setup failed during startup', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        setBootState({ kind: 'ready' });
        scheduleStartupSync('app_start');
      } catch (error) {
        setBootState({
          kind: accountDeletionRecoveryPending ? 'accountDeletionRecoveryFailed' : 'failed',
          error: toError(error),
        });
      }
    })();
  }, []);

  const handleResetLocalData = useCallback(async () => {
    setBootState({ kind: 'initializing' });
    try {
      await resetToGuestBootstrap();
      setBootState({ kind: 'ready' });
    } catch (error) {
      setBootState({ kind: 'failed', error: toError(error) });
    }
  }, []);

  const handleFinishAccountDeletionCleanup = useCallback(async () => {
    setBootState({ kind: 'initializing' });
    try {
      runMigrations();
      await recoverAccountDeletionAfterStartup();
      runMigrations();
      seedCuratedExercises();
      repairStaleInFlightOps(120);
      setBootState({ kind: 'ready' });
      scheduleStartupSync('app_start');
    } catch (error) {
      setBootState({ kind: 'accountDeletionRecoveryFailed', error: toError(error) });
    }
  }, []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (bootState.kind !== 'ready') {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        nextState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        scheduleForegroundSync('app_foreground');
      }
    });

    return () => subscription.remove();
  }, [bootState.kind]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppErrorBoundary>
          <ThemeProvider>
            {bootState.kind === 'initializing' ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : null}
            {bootState.kind === 'failed' ? (
              <StartupRecoveryScreen
                error={bootState.error}
                onRetry={initializeApp}
                onReset={handleResetLocalData}
              />
            ) : null}
            {bootState.kind === 'accountDeletionRecoveryFailed' ? (
              <StartupRecoveryScreen
                error={bootState.error}
                onRetry={initializeApp}
                onReset={handleFinishAccountDeletionCleanup}
                accountDeletionRecovery
              />
            ) : null}
            {bootState.kind === 'ready' ? <RootNavigator /> : null}
          </ThemeProvider>
        </AppErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1115',
  },
  recoveryContainer: {
    flex: 1,
    backgroundColor: '#0F1115',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
    justifyContent: 'center',
  },
  recoveryTitle: {
    marginBottom: tokens.spacing.sm,
  },
  recoveryBody: {
    marginBottom: tokens.spacing.lg,
    color: '#E8E8E8',
  },
  actions: {
    gap: tokens.spacing.sm,
  },
  devDetails: {
    marginTop: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    backgroundColor: '#171A21',
  },
});
