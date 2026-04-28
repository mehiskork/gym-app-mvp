import {
  getUsableAccountSessionWithFreshToken,
  refreshAccountSessionIfNeeded,
  signInWithGoogleForFirebase,
} from '../firebaseGoogleAuthClient';
import { accountSessionStore } from '../accountSessionStore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    getTokens: jest.fn(),
    signOut: jest.fn(async () => undefined),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  },
}));

jest.mock('../accountSessionStore', () => ({
  accountSessionStore: {
    getUsable: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    clear: jest.fn(),
  },
}));

describe('firebaseGoogleAuthClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-04-28T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exchanges a Google ID token for a Firebase session', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ data: { idToken: 'google-id-token' } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        idToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
        localId: 'firebase-uid',
        expiresIn: '3600',
        email: 'user@example.test',
        displayName: 'Test User',
      }),
    }) as unknown as typeof fetch;

    await expect(signInWithGoogleForFirebase()).resolves.toEqual({
      googleIdToken: 'google-id-token',
      firebaseSession: expect.objectContaining({
        accessToken: 'firebase-id-token',
        refreshToken: 'firebase-refresh-token',
        localId: 'firebase-uid',
        email: 'user@example.test',
      }),
    });
  });

  it('fails safely when Google sign-in returns no ID token', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({});
    (GoogleSignin.getTokens as jest.Mock).mockResolvedValue({});
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(signInWithGoogleForFirebase()).rejects.toThrow(
      'Google sign-in did not return an ID token.',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails safely when Firebase token exchange fails', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ idToken: 'google-id-token' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'INVALID_IDP_RESPONSE' } }),
    }) as unknown as typeof fetch;

    await expect(signInWithGoogleForFirebase()).rejects.toThrow('Firebase token exchange failed.');
  });

  it('refreshes a near-expired Firebase session and persists the new token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: 'fresh-id-token',
        refresh_token: 'fresh-refresh-token',
        user_id: 'firebase-uid',
        expires_in: '3600',
      }),
    }) as unknown as typeof fetch;

    await expect(
      refreshAccountSessionIfNeeded({
        accessToken: 'old-id-token',
        refreshToken: 'old-refresh-token',
        subject: 'firebase-uid',
        expiresAt: '2026-04-28T12:02:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'fresh-id-token',
        refreshToken: 'fresh-refresh-token',
        subject: 'firebase-uid',
      }),
    );
    expect(accountSessionStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'fresh-id-token' }),
    );
  });

  it('invalidates account session when Firebase refresh fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'TOKEN_EXPIRED' } }),
    }) as unknown as typeof fetch;

    await expect(
      refreshAccountSessionIfNeeded({
        accessToken: 'old-id-token',
        refreshToken: 'old-refresh-token',
        expiresAt: '2026-04-28T12:02:00.000Z',
      }),
    ).resolves.toBeNull();
    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('refresh_failed');
  });

  it('returns null when refresh invalidates the only usable account session', async () => {
    (accountSessionStore.getUsable as jest.Mock).mockResolvedValue({
      accessToken: 'old-id-token',
      refreshToken: 'old-refresh-token',
      expiresAt: '2026-04-28T12:02:00.000Z',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(getUsableAccountSessionWithFreshToken()).resolves.toBeNull();
    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('refresh_failed');
  });
});
