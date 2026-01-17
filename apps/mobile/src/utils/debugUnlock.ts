import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'debug_unlocked_v1';

export async function isDebugUnlocked(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

export async function setDebugUnlocked(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, value ? '1' : '0');
}
