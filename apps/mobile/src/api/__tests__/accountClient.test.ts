import { deleteMeWithAccountAuth, getMeWithAccountAuth } from '../accountClient';
import { accountSessionStore } from '../../auth/accountSessionStore';
import { getUsableAccountSessionWithFreshToken } from '../../auth/firebaseGoogleAuthClient';
import { api } from '../client';
import { ApiError } from '../errors';

jest.mock('../../auth/accountSessionStore', () => ({
  accountSessionStore: {
    invalidate: jest.fn(),
  },
}));

jest.mock('../../auth/firebaseGoogleAuthClient', () => ({
  getUsableAccountSessionWithFreshToken: jest.fn(),
}));

jest.mock('../client', () => ({
  api: {
    del: jest.fn(),
    get: jest.fn(),
  },
}));

describe('getMeWithAccountAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls /me with account bearer token', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue({
      accessToken: 'jwt-token',
      subject: 'acct-sub',
      issuer: 'https://issuer.example.test',
    });
    (api.get as jest.Mock).mockResolvedValue({ principalType: 'account', subject: 'acct-sub' });

    await expect(getMeWithAccountAuth()).resolves.toEqual({
      principalType: 'account',
      subject: 'acct-sub',
    });

    expect(api.get).toHaveBeenCalledWith('/me', {
      headers: {
        Authorization: 'Bearer jwt-token',
      },
    });
  });

  it('throws when no account session exists', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue(null);

    await expect(getMeWithAccountAuth()).rejects.toThrow('No account session token available');
  });
  it('invalidates account session when /me returns 401', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue({
      accessToken: 'jwt-token',
    });
    (api.get as jest.Mock).mockRejectedValue(new ApiError('Unauthorized', { status: 401 }));

    await expect(getMeWithAccountAuth()).rejects.toThrow('Unauthorized');

    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('me_401');
  });
});

describe('deleteMeWithAccountAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls DELETE /me with account bearer token and no body', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue({
      accessToken: 'jwt-token',
      subject: 'acct-sub',
      issuer: 'https://issuer.example.test',
    });
    (api.del as jest.Mock).mockResolvedValue(undefined);

    await expect(deleteMeWithAccountAuth()).resolves.toBeUndefined();

    expect(api.del).toHaveBeenCalledWith('/me', {
      headers: {
        Authorization: 'Bearer jwt-token',
      },
    });
    expect(JSON.stringify((api.del as jest.Mock).mock.calls[0])).not.toMatch(
      /userId|accountId|guestUserId|owner/,
    );
  });

  it('throws when no account session exists', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue(null);

    await expect(deleteMeWithAccountAuth()).rejects.toThrow('No account session token available');
    expect(api.del).not.toHaveBeenCalled();
  });

  it('invalidates account session when DELETE /me returns 401', async () => {
    (getUsableAccountSessionWithFreshToken as jest.Mock).mockResolvedValue({
      accessToken: 'jwt-token',
    });
    (api.del as jest.Mock).mockRejectedValue(new ApiError('Unauthorized', { status: 401 }));

    await expect(deleteMeWithAccountAuth()).rejects.toThrow('Unauthorized');

    expect(accountSessionStore.invalidate).toHaveBeenCalledWith('delete_me_401');
  });
});
