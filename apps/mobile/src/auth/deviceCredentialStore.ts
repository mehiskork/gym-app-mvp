import { exec, query } from '../db/db';
import { newId } from '../utils/ids';
import { getSecureStoreModule } from './secureStore';

const DEVICE_TOKEN_KEY = 'device_token_v1';
const DEVICE_SECRET_KEY = 'device_secret_v1';

const LEGACY_DEVICE_TOKEN_META_KEY = 'device_token';
const LEGACY_DEVICE_SECRET_META_KEY = 'device_secret';

type MetaRow = { value: string };

function getLegacyMetaValue(key: string): string | null {
    const row = query<MetaRow>(
        `
    SELECT value
    FROM app_meta
    WHERE key = ?
    LIMIT 1;
  `,
        [key],
    )[0];

    return row?.value ?? null;
}

function clearLegacyMetaValue(key: string): void {
    exec(
        `
    DELETE FROM app_meta
    WHERE key = ?;
  `,
        [key],
    );
}

async function migrateLegacyValue(
    secureKey: string,
    legacyMetaKey: string,
): Promise<string | null> {
    const secureStore = getSecureStoreModule();
    const secureValue = await secureStore.getItemAsync(secureKey);
    if (secureValue) return secureValue;

    const legacyValue = getLegacyMetaValue(legacyMetaKey);
    if (!legacyValue) return null;

    await secureStore.setItemAsync(secureKey, legacyValue);
    clearLegacyMetaValue(legacyMetaKey);
    return legacyValue;
}

export const deviceCredentialStore = {
    async getDeviceToken(): Promise<string | null> {
        return migrateLegacyValue(DEVICE_TOKEN_KEY, LEGACY_DEVICE_TOKEN_META_KEY);
    },

    async setDeviceToken(token: string | null): Promise<void> {
        const secureStore = getSecureStoreModule();
        if (!token) {
            await secureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
            clearLegacyMetaValue(LEGACY_DEVICE_TOKEN_META_KEY);
            return;
        }

        await secureStore.setItemAsync(DEVICE_TOKEN_KEY, token);
        clearLegacyMetaValue(LEGACY_DEVICE_TOKEN_META_KEY);
    },

    async getOrCreateDeviceSecret(): Promise<string> {
        const existing = await migrateLegacyValue(DEVICE_SECRET_KEY, LEGACY_DEVICE_SECRET_META_KEY);
        if (existing) return existing;

        const secret = newId('sec');
        const secureStore = getSecureStoreModule();
        await secureStore.setItemAsync(DEVICE_SECRET_KEY, secret);
        clearLegacyMetaValue(LEGACY_DEVICE_SECRET_META_KEY);
        return secret;
    },

    async clear(): Promise<void> {
        const secureStore = getSecureStoreModule();
        await secureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
        await secureStore.deleteItemAsync(DEVICE_SECRET_KEY);
        clearLegacyMetaValue(LEGACY_DEVICE_TOKEN_META_KEY);
        clearLegacyMetaValue(LEGACY_DEVICE_SECRET_META_KEY);
    },
};