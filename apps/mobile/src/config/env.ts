function readPublicAppEnv(): string | undefined {
  const value = process.env.EXPO_PUBLIC_APP_ENV;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function getPublicAppEnv(): string | undefined {
  return readPublicAppEnv();
}

export const isDebugScreenEnabled = __DEV__ || getPublicAppEnv() === 'preview';
