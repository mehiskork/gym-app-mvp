const mockSecureStore = {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
};

jest.mock('expo-secure-store', () => mockSecureStore, { virtual: true });

import { accountSessionStore } from '../accountSessionStore';

describe('accountSessionStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('stores account session in secure storage', async () => {
        await accountSessionStore.set({
            accessToken: 'account-token',
            subject: 'acct-sub',
            issuer: 'https://issuer.example.test',
        });

        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
            'account_session_v1',
            JSON.stringify({
                accessToken: 'account-token',
                subject: 'acct-sub',
                issuer: 'https://issuer.example.test',
            }),
        );
    });

    it('loads account session from secure storage', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue(
            JSON.stringify({
                accessToken: 'account-token',
                subject: 'acct-sub',
                issuer: 'https://issuer.example.test',
            }),
        );

        await expect(accountSessionStore.get()).resolves.toEqual({
            accessToken: 'account-token',
            subject: 'acct-sub',
            issuer: 'https://issuer.example.test',
        });
    });

    it('returns null when secure storage payload is malformed', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue('{bad json');

        await expect(accountSessionStore.get()).resolves.toBeNull();
    });

    it('clears account session from secure storage', async () => {
        await accountSessionStore.clear();

        expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('account_session_v1');
    });
});