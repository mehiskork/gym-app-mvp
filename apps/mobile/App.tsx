import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { runMigrations } from './src/db/migrate';
import { resetLocalDatabase } from './src/db/db';
import { RootNavigator } from './src/navigation/RootNavigator';
import { seedCuratedExercises } from './src/db/curatedExerciseSeed';
import { repairStaleInFlightOps } from './src/db/outboxRepo';
import { ThemeProvider } from './src/theme/theme';
import { tokens } from './src/theme/tokens';
import { ensureRestTimerNotificationChannel } from './src/utils/restTimerNotifications';
import { Button } from './src/ui/Button';
import { Text } from './src/ui/Text';

type BootState =
  | { kind: 'initializing' }
  | { kind: 'ready' }
  | { kind: 'failed'; error: Error };

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
  return (
    <View style={styles.recoveryContainer}>
      <Text variant="title" weight="700" style={styles.recoveryTitle}>
        Couldn&apos;t open app data
      </Text>
      <Text variant="body" style={styles.recoveryBody}>
        The app couldn&apos;t finish updating local data. You can try again, or reset local app
        data and start fresh on this device.
      </Text>
      <View style={styles.actions}>
        <Button title="Try again" onPress={onRetry} />
        <Button title="Reset local data" variant="destructive" onPress={onReset} />
      </View>
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

  const initializeApp = useCallback(() => {
    setBootState({ kind: 'initializing' });

    try {
      runMigrations();
      seedCuratedExercises();
      repairStaleInFlightOps(120);
      void ensureRestTimerNotificationChannel(false);
      setBootState({ kind: 'ready' });
    } catch (error) {
      setBootState({ kind: 'failed', error: toError(error) });
    }
  }, []);

  const handleResetLocalData = useCallback(() => {
    setBootState({ kind: 'initializing' });
    try {
      resetLocalDatabase();
      initializeApp();
    } catch (error) {
      setBootState({ kind: 'failed', error: toError(error) });
    }
  }, [initializeApp]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);


  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
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
