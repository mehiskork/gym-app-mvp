describe('getApiBaseUrl', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        jest.resetModules();
        jest.dontMock('expo-constants');
    });

    it('prefers Expo extra config over environment variables', () => {
        process.env.EXPO_PUBLIC_API_BASE_URL = 'https://env.example.test';

        jest.doMock('expo-constants', () => ({
            expoConfig: {
                extra: {
                    API_BASE_URL: 'https://expo.example.test',
                },
            },
        }));

        const { getApiBaseUrl } = require('../config') as typeof import('../config');

        expect(getApiBaseUrl()).toBe('https://expo.example.test');
    });

    it('uses environment variables when Expo extras are unavailable', () => {
        process.env.EXPO_PUBLIC_API_BASE_URL = 'https://env.example.test';

        jest.doMock('expo-constants', () => {
            throw new Error('expo constants unavailable');
        });

        const { getApiBaseUrl } = require('../config') as typeof import('../config');

        expect(getApiBaseUrl()).toBe('https://env.example.test');
    });

    it('falls back to localhost default when no config exists', () => {
        delete process.env.EXPO_PUBLIC_API_BASE_URL;
        delete process.env.API_BASE_URL;

        jest.doMock('expo-constants', () => ({}));

        const { getApiBaseUrl, API_BASE_URL_FALLBACK } = require('../config') as typeof import('../config');

        expect(getApiBaseUrl()).toBe(API_BASE_URL_FALLBACK);
        expect(getApiBaseUrl()).toBe('http://localhost:8080');
    });
});