export const MAX_SETS_PER_EXERCISE = 50;

export const WORKOUT_LIMIT_MESSAGES = {
  maxSetsPerExercise: 'Max 50 sets per exercise',
} as const;

export class WorkoutLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutLimitError';
  }
}

export function isWorkoutLimitError(error: unknown): error is WorkoutLimitError {
  return error instanceof WorkoutLimitError;
}
