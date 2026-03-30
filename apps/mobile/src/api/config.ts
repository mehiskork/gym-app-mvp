const DEFAULT_BASE_URL = 'http://localhost:8080';

type ExpoConstantsModule = {
  expoConfig?: { extra?: Record<string, unknown> };
  manifest?: { extra?: Record<string, unknown> };
};

function readExpoExtra(key: string): string | undefined {
  try {
    const Constants = require('expo-constants') as ExpoConstantsModule;
    const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra;
    const value = extra?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function getApiBaseUrl(): string {
  const expoValue = readExpoExtra('API_BASE_URL') ?? readExpoExtra('EXPO_PUBLIC_API_BASE_URL');
  const envValue = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;

  return expoValue ?? envValue ?? DEFAULT_BASE_URL;
}

export const API_BASE_URL_FALLBACK = DEFAULT_BASE_URL;
