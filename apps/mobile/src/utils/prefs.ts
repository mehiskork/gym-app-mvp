import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getBool(key: string, defaultValue: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  if (v === null) return defaultValue;
  return v === '1';
}

export async function setBool(key: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(key, value ? '1' : '0');
}
