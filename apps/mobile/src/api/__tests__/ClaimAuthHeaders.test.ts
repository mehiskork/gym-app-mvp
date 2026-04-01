jest.mock('../../auth/deviceCredentialStore', () => ({
  deviceCredentialStore: {
    getDeviceToken: jest.fn(async () => 'device-token-123'),
  },
}));

jest.mock('../config', () => ({
  getApiBaseUrl: jest.fn(() => 'https://api.example.test'),
}));

import { api } from '../client';

describe('claim API auth headers', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        claimId: 'claim-1',
        code: 'ABC123',
        expiresAt: '2026-01-01T00:00:00.000Z',
      }),
    } as never) as unknown as typeof fetch;
  });

  it('includes Authorization header for /claim/start when device token exists', async () => {
    await api.post('/claim/start');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/claim/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer device-token-123',
        }),
      }),
    );
  });
});
