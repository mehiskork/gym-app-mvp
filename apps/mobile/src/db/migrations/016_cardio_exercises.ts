import type { Migration } from './index';

export const migration016_cardio_exercises: Migration = {
  id: 16,
  name: 'cardio_exercises',
  up: `
    ALTER TABLE exercise
      ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'
      CHECK (exercise_type IN ('strength', 'cardio'));

    ALTER TABLE exercise
      ADD COLUMN cardio_profile TEXT
      CHECK (cardio_profile IN ('treadmill', 'bike', 'ergometer', 'stairs', 'elliptical'));

    ALTER TABLE workout_session_exercise
      ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'
      CHECK (exercise_type IN ('strength', 'cardio'));

    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_profile TEXT
      CHECK (cardio_profile IN ('treadmill', 'bike', 'ergometer', 'stairs', 'elliptical'));

    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_duration_minutes INTEGER;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_distance_km REAL;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_speed_kph REAL;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_incline_percent REAL;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_resistance_level REAL;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_pace_seconds_per_km REAL;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_floors INTEGER;
    ALTER TABLE workout_session_exercise
      ADD COLUMN cardio_stair_level REAL;
  `,
};