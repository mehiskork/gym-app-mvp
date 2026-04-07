import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getBool(key: string, defaultValue: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  if (v === null) return defaultValue;
  return v === '1';
}

export async function setBool(key: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(key, value ? '1' : '0');
}

export async function getString(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setString(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function removeString(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
