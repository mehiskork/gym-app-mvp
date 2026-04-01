const DEFAULT_BASE_URL = 'http://localhost:8080';

type ExpoConstantsModule = {
  expoConfig?: { extra?: Record<string, unknown> };
  manifest?: { extra?: Record<string, unknown> };
};

function getExpoConstants(): ExpoConstantsModule | undefined {
  try {
    const constantsModule = require('expo-constants');
    return (constantsModule?.default ?? constantsModule) as ExpoConstantsModule;
  } catch {
    return undefined;
  }
}

function readExpoExtra(key: string): string | undefined {
  const expoConstants = getExpoConstants();
  const extra = expoConstants?.expoConfig?.extra ?? expoConstants?.manifest?.extra;
  const value = extra?.[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

export function getApiBaseUrl(): string {
  const expoValue = readExpoExtra('API_BASE_URL') ?? readExpoExtra('EXPO_PUBLIC_API_BASE_URL');
  const envValue = process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;

  return expoValue ?? envValue ?? DEFAULT_BASE_URL;
}

export const API_BASE_URL_FALLBACK = DEFAULT_BASE_URL;