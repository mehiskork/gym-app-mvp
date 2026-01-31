type HeaderMap = Record<string, string>;

function hasHeader(headers: HeaderMap, headerName: string): boolean {
    const target = headerName.toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function readDeviceToken(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getDeviceToken } = require('../db/appMetaRepo') as {
            getDeviceToken?: () => string | null;
        };
        return getDeviceToken?.() ?? null;
    } catch {
        return null;
    }
}

export async function buildHeaders(extra: HeaderMap = {}): Promise<HeaderMap> {
    const headers: HeaderMap = { ...extra };
    const deviceToken = readDeviceToken();

    if (deviceToken && !hasHeader(headers, 'authorization')) {
        headers.Authorization = `Bearer ${deviceToken}`;
    }

    return headers;
}