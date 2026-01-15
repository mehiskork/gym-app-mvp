import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
// keep your other imports (appMetaRepo etc.)

export default function App() {
  useEffect(() => {
    runMigrations();
    // your other startup calls...
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
    </GestureHandlerRootView>
  );
}

