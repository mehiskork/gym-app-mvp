export const EXERCISE_TYPE = {
    STRENGTH: 'strength',
    CARDIO: 'cardio',
} as const;

export type ExerciseType = (typeof EXERCISE_TYPE)[keyof typeof EXERCISE_TYPE];

export const CARDIO_PROFILE = {
    TREADMILL: 'treadmill',
    BIKE: 'bike',
    ERGOMETER: 'ergometer',
    STAIRS: 'stairs',
    ELLIPTICAL: 'elliptical',
} as const;

export type CardioProfile = (typeof CARDIO_PROFILE)[keyof typeof CARDIO_PROFILE];

export type CardioSummary = {
    duration_seconds: number | null;
    distance_km: number | null;
    speed_kph: number | null;
    incline_percent: number | null;
    resistance_level: number | null;
    pace_seconds_per_km: number | null;
    floors: number | null;
    stair_level: number | null;
};

export const EMPTY_CARDIO_SUMMARY: CardioSummary = {
    duration_seconds: null,
    distance_km: null,
    speed_kph: null,
    incline_percent: null,
    resistance_level: null,
    pace_seconds_per_km: null,
    floors: null,
    stair_level: null,
};