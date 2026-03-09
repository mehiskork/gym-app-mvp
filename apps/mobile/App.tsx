import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
import { ThemeProvider } from './src/theme/theme';
import { seedCuratedExercises } from './src/db/curatedExerciseSeed';
import { repairStaleInFlightOps } from './src/db/outboxRepo';
import { ensureRestTimerNotificationChannel } from './src/utils/restTimerNotifications';

export default function App() {
  useEffect(() => {
    runMigrations();
    seedCuratedExercises();
    repairStaleInFlightOps(120);
    void ensureRestTimerNotificationChannel(false);

  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
