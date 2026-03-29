import type { ExerciseRow } from '../db/exerciseRepo';
import type { ExerciseType } from '../db/exerciseTypes';

export type ExerciseSourceFilter = 'curated' | 'custom' | null;

export function toggleSingleSelect<T extends string>(current: T | null, next: T): T | null {
    return current === next ? null : next;
}

export function filterExercises(
    exercises: ExerciseRow[],
    query: string,
    exerciseType: ExerciseType | null,
    source: ExerciseSourceFilter,
): ExerciseRow[] {
    const normalizedQuery = query.trim().toLowerCase();

    return exercises.filter((exercise) => {
        if (normalizedQuery.length > 0 && !exercise.name.toLowerCase().includes(normalizedQuery)) {
            return false;
        }
        if (exerciseType && exercise.exercise_type !== exerciseType) {
            return false;
        }
        if (source === 'custom' && exercise.is_custom !== 1) {
            return false;
        }
        if (source === 'curated' && exercise.is_custom !== 0) {
            return false;
        }
        return true;
    });
}
