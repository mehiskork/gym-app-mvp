const mockSecureStore = {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
};

const mockExec = jest.fn();
const mockQuery = jest.fn();

jest.mock('../secureStore', () => ({
    getSecureStoreModule: () => mockSecureStore,
}));
jest.mock('../../db/db', () => ({
    exec: (...args: unknown[]) => mockExec(...args),
    query: (...args: unknown[]) => mockQuery(...args),
}));

import { deviceCredentialStore } from '../deviceCredentialStore';

describe('deviceCredentialStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQuery.mockReturnValue([]);
        mockSecureStore.getItemAsync.mockResolvedValue(null);
    });

    it('prefers secure storage for device token reads', async () => {
        mockSecureStore.getItemAsync.mockResolvedValueOnce('secure-token');

        await expect(deviceCredentialStore.getDeviceToken()).resolves.toBe('secure-token');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('migrates legacy sqlite device token into secure storage', async () => {
        mockQuery.mockReturnValueOnce([{ value: 'legacy-token' }]);

        await expect(deviceCredentialStore.getDeviceToken()).resolves.toBe('legacy-token');
        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('device_token_v1', 'legacy-token');
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['device_token']);
    });

    it('creates and stores device secret in secure storage only', async () => {
        const secret = await deviceCredentialStore.getOrCreateDeviceSecret();

        expect(secret).toMatch(/^sec_/);
        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('device_secret_v1', secret);
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['device_secret']);
    });

    it('clears secure and legacy keys on clear()', async () => {
        await deviceCredentialStore.clear();

        expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('device_token_v1');
        expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('device_secret_v1');
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['device_token']);
        expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM app_meta'), ['device_secret']);
    });
});