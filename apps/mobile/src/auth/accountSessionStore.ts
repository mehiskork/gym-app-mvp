import { exec, query } from '../db/db';
import { getSecureStoreModule } from './secureStore';

const ACCOUNT_SESSION_KEY = 'account_session_v1';
const LEGACY_ACCOUNT_SESSION_JSON_KEY = 'account_session_v1';
const LEGACY_ACCESS_TOKEN_KEY = 'account_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'account_refresh_token';
const LEGACY_SUBJECT_KEY = 'account_subject';
const LEGACY_ISSUER_KEY = 'account_issuer';
const LEGACY_SESSION_SECRET_KEY = 'account_session_secret';

type MetaRow = { value: string };

export type AccountSession = {
    accessToken: string;
    subject?: string;
    issuer?: string;
    refreshToken?: string;
    sessionSecret?: string;
};

function parseSession(raw: string): AccountSession | null {
    try {
        const parsed = JSON.parse(raw) as Partial<AccountSession>;
        if (!parsed.accessToken) {
            return null;
        }
        return {
            accessToken: parsed.accessToken,
            subject: parsed.subject,
            issuer: parsed.issuer,
            refreshToken: parsed.refreshToken,
            sessionSecret: parsed.sessionSecret,
        };
    } catch {
        return null;
    }
}

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

function clearLegacyAccountSessionMetaKeys(): void {
    clearLegacyMetaValue(LEGACY_ACCOUNT_SESSION_JSON_KEY);
    clearLegacyMetaValue(LEGACY_ACCESS_TOKEN_KEY);
    clearLegacyMetaValue(LEGACY_REFRESH_TOKEN_KEY);
    clearLegacyMetaValue(LEGACY_SUBJECT_KEY);
    clearLegacyMetaValue(LEGACY_ISSUER_KEY);
    clearLegacyMetaValue(LEGACY_SESSION_SECRET_KEY);
}

function readLegacySessionFromSqlite(): AccountSession | null {
    const legacyJson = getLegacyMetaValue(LEGACY_ACCOUNT_SESSION_JSON_KEY);
    if (legacyJson) {
        return parseSession(legacyJson);
    }

    const accessToken = getLegacyMetaValue(LEGACY_ACCESS_TOKEN_KEY);
    if (!accessToken) return null;

    return {
        accessToken,
        refreshToken: getLegacyMetaValue(LEGACY_REFRESH_TOKEN_KEY) ?? undefined,
        subject: getLegacyMetaValue(LEGACY_SUBJECT_KEY) ?? undefined,
        issuer: getLegacyMetaValue(LEGACY_ISSUER_KEY) ?? undefined,
        sessionSecret: getLegacyMetaValue(LEGACY_SESSION_SECRET_KEY) ?? undefined,
    };
}

export const accountSessionStore = {
    async get(): Promise<AccountSession | null> {
        const secureStore = getSecureStoreModule();
        const raw = await secureStore.getItemAsync(ACCOUNT_SESSION_KEY);
        if (raw) {
            return parseSession(raw);
        }

        const legacySession = readLegacySessionFromSqlite();
        if (!legacySession) return null;

        await secureStore.setItemAsync(ACCOUNT_SESSION_KEY, JSON.stringify(legacySession));
        clearLegacyAccountSessionMetaKeys();
        return legacySession;
    },

    async set(session: AccountSession): Promise<void> {
        const secureStore = getSecureStoreModule();
        await secureStore.setItemAsync(ACCOUNT_SESSION_KEY, JSON.stringify(session));
        clearLegacyAccountSessionMetaKeys();
    },

    async clear(): Promise<void> {
        const secureStore = getSecureStoreModule();
        await secureStore.deleteItemAsync(ACCOUNT_SESSION_KEY);
        clearLegacyAccountSessionMetaKeys();
    },
};