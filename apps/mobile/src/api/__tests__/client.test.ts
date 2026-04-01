import { jest } from '@jest/globals';

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  manifest: { extra: {} },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { apiRequest, api } from '../client';
import { ApiError } from '../errors';

describe('api client', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
    jest.clearAllMocks();
  });

  it('times out when request exceeds timeoutMs', async () => {
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        }),
    ) as unknown as typeof fetch;

    await expect(api.get('/timeout', { timeoutMs: 10 })).rejects.toMatchObject({
      isTimeout: true,
    });
  });

  it('maps backend JSON errors to ApiError', async () => {
    global.fetch = jest.fn(async () => {
      const headers = new Headers({
        'content-type': 'application/json',
        'x-request-id': 'rid-header',
      });
      return {
        ok: false,
        status: 400,
        headers,
        json: async () => ({
          code: 'SOME_CODE',
          message: 'Bad request',
          requestId: 'rid123',
          details: { field: 'value' },
        }),
        text: async () => '',
      } as Response;
    }) as unknown as typeof fetch;

    await expect(apiRequest('POST', '/claim/confirm', { body: {} })).rejects.toMatchObject({
      status: 400,
      code: 'SOME_CODE',
      requestId: 'rid123',
      details: { field: 'value' },
    });
  });

  it('handles non-JSON error responses', async () => {
    global.fetch = jest.fn(async () => {
      const headers = new Headers({ 'content-type': 'text/plain' });
      return {
        ok: false,
        status: 500,
        headers,
        json: async () => ({ message: 'should not parse' }),
        text: async () => 'Server error',
      } as Response;
    }) as unknown as typeof fetch;

    const request = api.get('/oops');

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 500,
      code: undefined,
    });
  });
});
