import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
import { seedCuratedExercises } from './src/db/curatedExerciseSeed';
import { repairStaleInFlightOps } from './src/db/outboxRepo';

export default function App() {
  useEffect(() => {
    runMigrations();
    seedCuratedExercises();
    repairStaleInFlightOps(120);

  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
