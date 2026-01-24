export const WORKOUT_SESSION_STATUS = {
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DISCARDED: 'discarded',
} as const;

export type WorkoutSessionStatus = (typeof WORKOUT_SESSION_STATUS)[keyof typeof WORKOUT_SESSION_STATUS];

export const OUTBOX_STATUS = {
    PENDING: 'pending',
    IN_FLIGHT: 'in_flight',
    FAILED: 'failed',
    ACKED: 'acked',
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];