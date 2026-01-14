import React, { useEffect } from 'react';
import { RootNavigator } from './src/navigation/RootNavigator';
import { runMigrations } from './src/db/migrate';
import { seedCuratedExercises } from './src/db/seed/seedCuratedExercises';

export default function App() {
  useEffect(() => {
    runMigrations();
    seedCuratedExercises();
  }, []);

  return <RootNavigator />;
}
