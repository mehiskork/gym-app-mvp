export type ApiErrorCode =
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'NETWORK'
    | 'CLAIM_INVALID'
    | 'CLAIM_EXPIRED'
    | 'UNKNOWN';

export class ApiError extends Error {
    code: ApiErrorCode;
    status: number | null;
    details: unknown;

    constructor(code: ApiErrorCode, message: string, status: number | null, details?: unknown) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

type ApiRequestOptions = {
    headers?: Record<string, string>;
    timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function getBaseUrl(): string {
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
    if (!baseUrl) {
        throw new ApiError('UNKNOWN', 'API base URL not configured.', null);
    }
    return baseUrl;
}

function classifyNetworkError(err: unknown): ApiErrorCode {
    if (err instanceof Error && err.name === 'AbortError') return 'TIMEOUT';
    const message = err instanceof Error ? err.message : String(err ?? '');
    if (/timeout/i.test(message)) return 'TIMEOUT';
    if (/network/i.test(message)) return 'NETWORK';
    if (/failed to fetch/i.test(message)) return 'NETWORK';
    return 'UNKNOWN';
}

async function readJsonSafe(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function mapHttpErrorCode(status: number, payload: unknown): ApiErrorCode {
    if (payload && typeof payload === 'object' && 'code' in payload) {
        const code = String((payload as { code?: string }).code ?? 'UNKNOWN');
        if (code === 'CLAIM_INVALID') return 'CLAIM_INVALID';
        if (code === 'CLAIM_EXPIRED') return 'CLAIM_EXPIRED';
        if (code === 'RATE_LIMITED') return 'RATE_LIMITED';
    }
    if (status === 429) return 'RATE_LIMITED';
    return 'UNKNOWN';
}

export async function apiPost<T>(path: string, body?: unknown, options: ApiRequestOptions = {}) {
    const baseUrl = getBaseUrl();
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });

        const payload = await readJsonSafe(response);

        if (!response.ok) {
            const code = mapHttpErrorCode(response.status, payload);
            const message =
                payload && typeof payload === 'object' && 'message' in payload
                    ? String((payload as { message?: string }).message ?? 'Request failed.')
                    : `Request failed (${response.status}).`;
            throw new ApiError(code, message, response.status, payload);
        }

        return payload as T;
    } catch (err) {
        if (err instanceof ApiError) throw err;
        const code = classifyNetworkError(err);
        const message = err instanceof Error ? err.message : 'Request failed.';
        throw new ApiError(code, message, null);
    } finally {
        clearTimeout(timeout);
    }
}