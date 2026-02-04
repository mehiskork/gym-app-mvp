import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
import { seedCuratedExercises } from './src/db/curatedExerciseSeed';
import { repairStaleInFlightOps } from './src/db/outboxRepo';
import { ensureRestTimerNotificationChannel } from './src/utils/restTimerNotifications';

export default function App() {
  useEffect(() => {
    runMigrations();
    seedCuratedExercises();
    repairStaleInFlightOps(120);
    void ensureRestTimerNotificationChannel();

  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RootNavigator />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
