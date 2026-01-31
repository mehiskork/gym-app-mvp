export type ApiErrorOptions = {
    status?: number;
    code?: string;
    requestId?: string;
    details?: unknown;
    isTimeout?: boolean;
    isNetworkError?: boolean;
};

export class ApiError extends Error {
    status?: number;
    code?: string;
    requestId?: string;
    details?: unknown;
    isTimeout?: boolean;
    isNetworkError?: boolean;

    constructor(message: string, options: ApiErrorOptions = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = options.status;
        this.code = options.code;
        this.requestId = options.requestId;
        this.details = options.details;
        this.isTimeout = options.isTimeout;
        this.isNetworkError = options.isNetworkError;
    }
}