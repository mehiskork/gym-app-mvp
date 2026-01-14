import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
import { seedCuratedExercises } from './src/db/seed/seedCuratedExercises';

export default function App() {
  useEffect(() => {
    runMigrations();
    seedCuratedExercises();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
