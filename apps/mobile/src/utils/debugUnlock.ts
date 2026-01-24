import { getBool, setBool } from './prefs';

const KEY = 'debug_unlocked_v1';

export async function isDebugUnlocked(): Promise<boolean> {
  return getBool(KEY, false);
}

export async function setDebugUnlocked(value: boolean): Promise<void> {
  await setBool(KEY, value);
}
