import { getApiBaseUrl } from './config';
import { ApiError } from './errors';
import { buildHeaders } from './headers';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type ApiRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type ErrorResponseBody = {
  code?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
};

const DEFAULT_TIMEOUT_MS = 10_000;

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ApiError('Request timed out', { isTimeout: true }));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  { body, headers: extraHeaders, timeoutMs }: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers = await buildHeaders(extraHeaders);
  if (!hasHeader(headers, 'accept')) {
    headers.Accept = 'application/json';
  }
  if (body !== undefined && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const fetchPromise = fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: controller?.signal,
  });

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let response: Response;

  try {
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
      response = await fetchPromise;
    } else {
      response = await withTimeout(fetchPromise, timeout);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out', { isTimeout: true });
    }

    const message = error instanceof Error ? error.message : 'Network error';
    throw new ApiError(message, { isNetworkError: true });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  let parsedBody: unknown = undefined;
  let parsedText: string | undefined = undefined;

  if (isJson) {
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = undefined;
    }
  } else {
    try {
      parsedText = await response.text();
    } catch {
      parsedText = undefined;
    }
  }

  if (!response.ok) {
    const errorBody = parsedBody as ErrorResponseBody | undefined;
    const message =
      typeof errorBody?.message === 'string'
        ? errorBody.message
        : `Request failed with status ${response.status}`;
    const requestId =
      typeof errorBody?.requestId === 'string'
        ? errorBody.requestId
        : (response.headers.get('x-request-id') ?? undefined);

    throw new ApiError(message, {
      status: response.status,
      code: typeof errorBody?.code === 'string' ? errorBody.code : undefined,
      requestId,
      details: errorBody?.details,
    });
  }

  if (isJson) {
    return parsedBody as T;
  }

  return parsedText as T;
}

type ApiRequestOptionsWithoutBody = Omit<ApiRequestOptions, 'body'>;

type ApiClient = {
  get: <T>(path: string, options?: ApiRequestOptionsWithoutBody) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptionsWithoutBody) => Promise<T>;
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptionsWithoutBody) => Promise<T>;
  del: <T>(path: string, options?: ApiRequestOptionsWithoutBody) => Promise<T>;
};

export const api: ApiClient = {
  get: (path, options) => apiRequest('GET', path, options),
  post: (path, body, options) => apiRequest('POST', path, { ...options, body }),
  put: (path, body, options) => apiRequest('PUT', path, { ...options, body }),
  del: (path, options) => apiRequest('DELETE', path, options),
};
