import { getMeWithAccountAuth } from '../accountClient';
import { accountSessionStore } from '../../auth/accountSessionStore';
import { api } from '../client';

jest.mock('../../auth/accountSessionStore', () => ({
    accountSessionStore: {
        get: jest.fn(),
    },
}));

jest.mock('../client', () => ({
    api: {
        get: jest.fn(),
    },
}));

describe('getMeWithAccountAuth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calls /me with account bearer token', async () => {
        (accountSessionStore.get as jest.Mock).mockResolvedValue({
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
        (accountSessionStore.get as jest.Mock).mockResolvedValue(null);

        await expect(getMeWithAccountAuth()).rejects.toThrow('No account session token available');
    });
});