export type SecureStoreModule = {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
};

export function getSecureStoreModule(): SecureStoreModule {
    const secureStore = require('expo-secure-store') as SecureStoreModule;
    if (!secureStore?.getItemAsync || !secureStore?.setItemAsync || !secureStore?.deleteItemAsync) {
        throw new Error('expo-secure-store is not available');
    }
    return secureStore;
}