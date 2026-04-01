const mockSecureStore = {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
};

const mockExec = jest.fn();
const mockQuery = jest.fn();

jest.mock('expo-secure-store', () => mockSecureStore, { virtual: true });
jest.mock('../../db/db', () => ({
    exec: (...args: unknown[]) => mockExec(...args),
    query: (...args: unknown[]) => mockQuery(...args),
}));

import { accountSessionStore } from '../accountSessionStore';

describe('accountSessionStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockReturnValue([]);
        mockSecureStore.getItemAsync.mockResolvedValue(null);
    });

    it('stores account session in secure storage', async () => {
        await accountSessionStore.set({
            accessToken: 'account-token',
            subject: 'acct-sub',
            issuer: 'https://issuer.example.test',
            refreshToken: 'refresh-token',
            sessionSecret: 'secret-material',
        });

        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
            'account_session_v1',
            JSON.stringify({
                accessToken: 'account-token',
                subject: 'acct-sub',
                issuer: 'https://issuer.example.test',
                refreshToken: 'refresh-token',
                sessionSecret: 'secret-material',
            }),
        );
    });

    it('loads account session from secure storage first', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue(
            JSON.stringify({
                accessToken: 'account-token',
                subject: 'acct-sub',
            }),
        );

        await expect(accountSessionStore.get()).resolves.toEqual({
            accessToken: 'account-token',
            subject: 'acct-sub',
            issuer: undefined,
            refreshToken: undefined,
            sessionSecret: undefined,
        });
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('migrates legacy sqlite account token material into secure storage', async () => {
        mockQuery.mockImplementation((_: string, [key]: [string]) => {
            const values: Record<string, string> = {
                account_access_token: 'legacy-access',
                account_refresh_token: 'legacy-refresh',
                account_session_secret: 'legacy-secret',
                account_subject: 'legacy-subject',
            };
            return values[key] ? [{ value: values[key] }] : [];
        });

        await expect(accountSessionStore.get()).resolves.toEqual({
            accessToken: 'legacy-access',
            refreshToken: 'legacy-refresh',
            sessionSecret: 'legacy-secret',
            subject: 'legacy-subject',
            issuer: undefined,
        });

        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
            'account_session_v1',
            expect.any(String),
        );
        const serialized = (mockSecureStore.setItemAsync as jest.Mock).mock.calls[0][1];
        expect(JSON.parse(serialized)).toMatchObject({
            accessToken: 'legacy-access',
            refreshToken: 'legacy-refresh',
            sessionSecret: 'legacy-secret',
            subject: 'legacy-subject',
        });
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['account_access_token']);
    });

    it('returns null when secure storage payload is malformed', async () => {
        mockSecureStore.getItemAsync.mockResolvedValue('{bad json');

        await expect(accountSessionStore.get()).resolves.toBeNull();
    });

    it('clears account session from secure and legacy storage', async () => {
        await accountSessionStore.clear();

        expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('account_session_v1');
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['account_session_secret']);
    });
});