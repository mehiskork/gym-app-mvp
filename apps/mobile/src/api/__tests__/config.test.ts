describe('getApiBaseUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.dontMock('expo-constants');
  });

  it('prefers environment variables over Expo extra config outside production', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://env.example.test';

    jest.doMock('expo-constants', () => ({
      expoConfig: {
        extra: {
          API_BASE_URL: 'https://expo.example.test',
        },
      },
    }));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe('https://env.example.test');
  });

  it('uses checked-in Expo public API base URL config when present', () => {
    jest.doMock('expo-constants', () => ({
      expoConfig: {
        extra: {
          EXPO_PUBLIC_API_BASE_URL: 'https://railway.example.test',
        },
      },
    }));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe('https://railway.example.test');
  });

  it('uses environment variables when Expo extras are unavailable', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://env.example.test';

    jest.doMock('expo-constants', () => {
      throw new Error('expo constants unavailable');
    });

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe('https://env.example.test');
  });

  it('allows preview to resolve the shared Railway backend URL', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://gym-app-mvp-production.up.railway.app';

    jest.doMock('expo-constants', () => ({}));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe('https://gym-app-mvp-production.up.railway.app');
  });

  it('resolves explicit production API base URL', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.trainframe.example';

    jest.doMock('expo-constants', () => ({
      expoConfig: {
        extra: {
          EXPO_PUBLIC_API_BASE_URL: 'https://gym-app-mvp-production.up.railway.app',
        },
      },
    }));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe('https://api.trainframe.example');
  });

  it('rejects production without explicit environment API base URL', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.API_BASE_URL;

    jest.doMock('expo-constants', () => ({
      expoConfig: {
        extra: {
          EXPO_PUBLIC_API_BASE_URL: 'https://api-from-extra.example',
        },
      },
    }));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(() => getApiBaseUrl()).toThrow('Production builds require EXPO_PUBLIC_API_BASE_URL');
  });

  it('rejects production using the shared Railway backend URL', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://gym-app-mvp-production.up.railway.app/';

    jest.doMock('expo-constants', () => ({}));

    const { getApiBaseUrl } = require('../config') as typeof import('../config');

    expect(() => getApiBaseUrl()).toThrow(
      'Production builds cannot use the shared QA/dev API base URL',
    );
  });

  it('falls back to localhost default when no config exists', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.API_BASE_URL;

    jest.doMock('expo-constants', () => ({}));

    const { getApiBaseUrl, API_BASE_URL_FALLBACK } =
      require('../config') as typeof import('../config');

    expect(getApiBaseUrl()).toBe(API_BASE_URL_FALLBACK);
    expect(getApiBaseUrl()).toBe('http://localhost:8080');
  });

  it('builds account deletion URL from configured API base URL', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/root';

    jest.doMock('expo-constants', () => {
      throw new Error('expo constants unavailable');
    });

    const { getAccountDeletionUrl } = require('../config') as typeof import('../config');

    expect(getAccountDeletionUrl()).toBe('https://api.example.test/account-deletion');
  });

  it('builds privacy policy URL from configured API base URL', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test/root';

    jest.doMock('expo-constants', () => {
      throw new Error('expo constants unavailable');
    });

    const { getPrivacyPolicyUrl } = require('../config') as typeof import('../config');

    expect(getPrivacyPolicyUrl()).toBe('https://api.example.test/privacy');
  });

  it('builds production account deletion URL from explicit production API base URL', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.trainframe.example/root';

    jest.doMock('expo-constants', () => ({}));

    const { getAccountDeletionUrl } = require('../config') as typeof import('../config');

    expect(getAccountDeletionUrl()).toBe('https://api.trainframe.example/account-deletion');
  });
});
