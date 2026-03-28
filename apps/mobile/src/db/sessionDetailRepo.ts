import { query } from './db';
import type { CardioProfile, ExerciseType } from './exerciseTypes';

export type SessionDetailSession = {
    id: string;
    title: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    workout_note: string | null;
    rest_timer_end_at: string | null;
    rest_timer_seconds: number | null;
    rest_timer_label: string | null;
};

export type SessionDetailExercise = {
    id: string;
    exercise_id: string;
    exercise_name: string;
    exercise_type: ExerciseType;
    cardio_profile: CardioProfile | null;
    position: number;
    notes: string | null;
    sets: SessionDetailSet[];
    cardio_duration_minutes: number | null;
    cardio_distance_km: number | null;
    cardio_speed_kph: number | null;
    cardio_incline_percent: number | null;
    cardio_resistance_level: number | null;
    cardio_pace_seconds_per_km: number | null;
    cardio_floors: number | null;
    cardio_stair_level: number | null;
};

export type SessionDetailSet = {
    id: string;
    workout_session_exercise_id: string;
    set_index: number;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    rest_seconds: number | null;
    notes: string | null;
    is_completed: number;
};

export function fetchSessionDetail(sessionId: string): {
    session: SessionDetailSession;
    exercises: SessionDetailExercise[];
} | null {
    const session = query<SessionDetailSession>(
        `
    SELECT
      id,
      title,
      status,
      started_at,
      ended_at,
      workout_note,
      rest_timer_end_at,
      rest_timer_seconds,
      rest_timer_label
    FROM workout_session
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1;
  `,
        [sessionId],
    )[0];

    if (!session) return null;

    const exercises = query<Omit<SessionDetailExercise, 'sets'>>(
        `
    SELECT
      id,
      exercise_id,
      exercise_name,
       exercise_type,
      cardio_profile,
      position,
      notes,
      cardio_duration_minutes,
      cardio_distance_km,
      cardio_speed_kph,
      cardio_incline_percent,
      cardio_resistance_level,
      cardio_pace_seconds_per_km,
      cardio_floors,
      cardio_stair_level
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND deleted_at IS NULL
    ORDER BY position ASC;
  `,
        [sessionId],
    );

    const sets = query<SessionDetailSet>(
        `
    SELECT
      id,
      workout_session_exercise_id,
      set_index,
      weight,
      reps,
      rpe,
      rest_seconds,
      notes,
      is_completed
    FROM workout_set
    WHERE workout_session_exercise_id IN (
      SELECT id
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND deleted_at IS NULL
    )
      AND deleted_at IS NULL
    ORDER BY workout_session_exercise_id ASC, set_index ASC;
  `,
        [sessionId],
    );

    const setsByExercise = new Map<string, SessionDetailSet[]>();
    for (const set of sets) {
        const list = setsByExercise.get(set.workout_session_exercise_id) ?? [];
        list.push(set);
        setsByExercise.set(set.workout_session_exercise_id, list);
    }

    const exercisesWithSets: SessionDetailExercise[] = exercises.map((exercise) => ({
        ...exercise,
        sets: setsByExercise.get(exercise.id) ?? [],
    }));

    return { session, exercises: exercisesWithSets };
}