type SecureStoreModule = {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
};

const ACCOUNT_SESSION_KEY = 'account_session_v1';

export type AccountSession = {
    accessToken: string;
    subject: string;
    issuer?: string;
};

function getSecureStoreModule(): SecureStoreModule {
    const secureStore = require('expo-secure-store') as SecureStoreModule;
    if (!secureStore?.getItemAsync || !secureStore?.setItemAsync || !secureStore?.deleteItemAsync) {
        throw new Error('expo-secure-store is not available');
    }
    return secureStore;
}

export const accountSessionStore = {
    async get(): Promise<AccountSession | null> {
        const secureStore = getSecureStoreModule();
        const raw = await secureStore.getItemAsync(ACCOUNT_SESSION_KEY);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as Partial<AccountSession>;
            if (!parsed.accessToken || !parsed.subject) {
                return null;
            }

            return {
                accessToken: parsed.accessToken,
                subject: parsed.subject,
                issuer: parsed.issuer,
            };
        } catch {
            return null;
        }
    },

    async set(session: AccountSession): Promise<void> {
        const secureStore = getSecureStoreModule();
        await secureStore.setItemAsync(ACCOUNT_SESSION_KEY, JSON.stringify(session));
    },

    async clear(): Promise<void> {
        const secureStore = getSecureStoreModule();
        await secureStore.deleteItemAsync(ACCOUNT_SESSION_KEY);
    },
};