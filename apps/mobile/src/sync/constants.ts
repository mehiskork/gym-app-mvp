// Max outbox ops to send per sync request.
export const SYNC_BATCH_LIMIT = 50;

// Base seconds for exponential backoff on sync failures.
export const SYNC_BACKOFF_BASE_SECONDS = 5;

// Max seconds to cap sync backoff delays.
export const SYNC_BACKOFF_MAX_SECONDS = 300;

// Seconds before an in-flight outbox op is considered stale and retried.
export const OUTBOX_STALE_IN_FLIGHT_SECONDS = 120;