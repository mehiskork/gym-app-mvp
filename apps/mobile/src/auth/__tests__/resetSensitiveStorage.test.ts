import { clearSensitiveAuthStorage } from '../resetSensitiveStorage';
import { deviceCredentialStore } from '../deviceCredentialStore';
import { accountSessionStore } from '../accountSessionStore';

jest.mock('../deviceCredentialStore', () => ({
    deviceCredentialStore: {
        clear: jest.fn(async () => undefined),
    },
}));

jest.mock('../accountSessionStore', () => ({
    accountSessionStore: {
        clear: jest.fn(async () => undefined),
    },
}));

describe('clearSensitiveAuthStorage', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('clears device token, device secret, and account session material', async () => {
        await clearSensitiveAuthStorage();

        expect(deviceCredentialStore.clear).toHaveBeenCalledTimes(1);
        expect(accountSessionStore.clear).toHaveBeenCalledTimes(1);
    });
});