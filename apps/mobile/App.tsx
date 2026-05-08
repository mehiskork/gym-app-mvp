import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { runMigrations } from './src/db/migrate';
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
import { scheduleForegroundSync, scheduleStartupSync } from './src/sync/syncScheduler';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { logEvent } from './src/utils/logger';
import { recoverPendingAccountDeletionCleanup } from './src/auth/accountDeletion';

type BootState = { kind: 'initializing' } | { kind: 'ready' } | { kind: 'failed'; error: Error };

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function StartupRecoveryScreen({
  error,
  onRetry,
  onReset,
}: {
  error: Error;
  onRetry: () => void;
  onReset: () => void;
}) {
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  return (
    <View style={styles.recoveryContainer}>
      <Text variant="title" weight="700" style={styles.recoveryTitle}>
        Couldn&apos;t open app data
      </Text>
      <Text variant="body" style={styles.recoveryBody}>
        The app couldn&apos;t finish updating local data. You can try again, or reset local app data
        and start fresh on this device.
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
        title="Reset local data on this device?"
        body="This clears local TrainFrame data and account credentials on this device. Synced account data can be restored after reconnecting. Unsynced local changes may be lost."
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
      try {
        await recoverPendingAccountDeletionCleanup();
        runMigrations();
        seedCuratedExercises();
        repairStaleInFlightOps(120);
        void ensureRestTimerNotificationChannel(false).catch((error) => {
          logEvent('warn', 'notifications', 'Rest notification setup failed during startup', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        setBootState({ kind: 'ready' });
        scheduleStartupSync('app_start');
      } catch (error) {
        setBootState({ kind: 'failed', error: toError(error) });
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
