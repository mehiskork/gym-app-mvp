import type { Migration } from './index';

export const migration003_program_day_exercise_planned_cardio_targets: Migration = {
  id: 3,
  name: 'program day exercise planned cardio targets',
  up: `
    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_duration_minutes INTEGER NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_distance_km REAL NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_speed_kph REAL NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_incline_percent REAL NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_resistance_level REAL NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_pace_seconds_per_km REAL NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_floors INTEGER NULL;

    ALTER TABLE program_day_exercise
      ADD COLUMN planned_cardio_stair_level REAL NULL;
  `,
};
