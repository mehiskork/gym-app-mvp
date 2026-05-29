// The checked-in Expo extra in app.json currently points to the shared Railway dev/QA backend.
// This localhost value is only a final fallback when no Expo extra or environment config exists.
const DEFAULT_BASE_URL = 'http://localhost:8080';
export const SHARED_QA_BASE_URL = 'https://gym-app-mvp-production.up.railway.app';

type ExpoConstantsModule = {
  expoConfig?: { extra?: Record<string, unknown> };
  manifest?: { extra?: Record<string, unknown> };
};

function getExpoConstants(): ExpoConstantsModule | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    return value.trim();
  }
  return undefined;
}

function readOptionalString(value: string | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function normalizeBaseUrlForComparison(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getAppEnv(): string {
  return (
    readOptionalString(process.env.EXPO_PUBLIC_APP_ENV) ??
    readOptionalString(process.env.APP_ENV) ??
    readExpoExtra('EXPO_PUBLIC_APP_ENV') ??
    readExpoExtra('APP_ENV') ??
    'development'
  ).toLowerCase();
}

export function getApiBaseUrl(): string {
  const envValue =
    readOptionalString(process.env.EXPO_PUBLIC_API_BASE_URL) ??
    readOptionalString(process.env.API_BASE_URL);
  const appEnv = getAppEnv();

  if (appEnv === 'production') {
    if (!envValue) {
      throw new Error('Production builds require EXPO_PUBLIC_API_BASE_URL');
    }
    if (normalizeBaseUrlForComparison(envValue) === SHARED_QA_BASE_URL) {
      throw new Error('Production builds cannot use the shared QA/dev API base URL');
    }
    return envValue;
  }

  const expoValue = readExpoExtra('API_BASE_URL') ?? readExpoExtra('EXPO_PUBLIC_API_BASE_URL');
  return envValue ?? expoValue ?? DEFAULT_BASE_URL;
}

export function getAccountDeletionUrl(): string {
  return new URL('/account-deletion', getApiBaseUrl()).toString();
}

export function getPrivacyPolicyUrl(): string {
  return new URL('/privacy', getApiBaseUrl()).toString();
}

export const API_BASE_URL_FALLBACK = DEFAULT_BASE_URL;
