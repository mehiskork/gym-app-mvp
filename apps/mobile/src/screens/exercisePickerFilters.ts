import type { ExerciseRow } from '../db/exerciseRepo';
import type { ExerciseType } from '../db/exerciseTypes';

export type ExerciseSourceFilter = 'curated' | 'custom' | null;

const CURATED_EXERCISE_ALIASES: Record<string, string[]> = {
  ex_overhead_press_barbell: ['OHP', 'Overhead Press', 'Military Press', 'BB OHP', 'BB Press'],
  ex_military_press: ['OHP', 'Overhead Press', 'Barbell Overhead Press', 'BB OHP'],
  ex_dumbbell_shoulder_press: [
    'DB Press',
    'DB Shoulder Press',
    'Dumbbell Press',
    'Shoulder Dumbbell Press',
  ],
  ex_bent_over_row_barbell: ['BB Row', 'Barbell Row'],
  ex_pullup: ['Pullup', 'Pull Up', 'Chinup', 'Chin Up'],
  ex_assisted_pullup: [
    'Assisted Pullup',
    'Assisted Pull Up',
    'Assisted Chinup',
    'Assisted Chin Up',
  ],
  ex_lat_pulldown: ['Lat Pull Down'],
  ex_lat_pulldown_wide_grip: ['Wide Grip Lat Pulldown', 'Wide-Grip Pulldown', 'Lat Pull Down'],
  ex_close_grip_lat_pulldown: ['Close Grip Lat Pulldown', 'Close-Grip Pulldown'],
  ex_seated_cable_row: ['Cable Row', 'Seated Row'],
  ex_close_grip_cable_row: [
    'Close Grip Cable Row',
    'Close-Grip Seated Cable Row',
    'Cable Row Close',
    'Close Cable Row',
  ],
  ex_cable_tricep_pushdown: ['Tricep Pushdown', 'Triceps Pushdown', 'Cable Pushdown'],
  ex_triceps_pushdown: ['Tricep Pushdown', 'Cable Tricep Pushdown', 'Cable Pushdown'],
  ex_rope_triceps_pushdown: ['Rope Pushdown', 'Tricep Pushdown', 'Triceps Pushdown'],
  ex_ez_bar_curl: ['EZ Curl', 'EZ Bar Curl', 'EZ-Bar Bicep Curl'],
  ex_reverse_pec_deck: ['Rear Delt Machine', 'Reverse Fly Machine'],
  ex_pec_deck: ['Pec Deck Machine', 'Machine Chest Fly', 'Machine Chest'],
  ex_chest_fly_machine: ['Pec Deck', 'Machine Chest Fly', 'Machine Chest'],
  ex_chest_press_machine: ['Machine Chest', 'Machine Chest Press'],
  ex_machine_chest_press: ['Machine Chest', 'Machine Chest Press', 'Chest Press Machine'],
  ex_machine_shoulder_press: [
    'Machine Shoulder',
    'Machine Shoulder Press',
    'Shoulder Press Machine',
  ],
  ex_bb_rdl: ['RDL', 'Romanian Deadlift', 'Barbell Romanian Deadlift', 'BB RDL'],
  ex_romanian_deadlift_dumbbell: [
    'RDL',
    'Romanian Deadlift',
    'Dumbbell Romanian Deadlift',
    'DB RDL',
  ],
  ex_hack_squat_machine_rdl: ['RDL', 'Romanian Deadlift', 'Machine RDL'],
};

type SearchText = {
  phrase: string;
  compact: string;
  tokens: string[];
};

export function toggleSingleSelect<T extends string>(current: T | null, next: T): T | null {
  return current === next ? null : next;
}

function normalizePhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(token: string): string {
  switch (token) {
    case 'db':
      return 'dumbbell';
    case 'bb':
      return 'barbell';
    case 'triceps':
      return 'tricep';
    case 'biceps':
      return 'bicep';
    case 'pullups':
      return 'pullup';
    case 'chinups':
      return 'chinup';
    case 'curls':
      return 'curl';
    default:
      return token;
  }
}

function toSearchText(value: string): SearchText {
  const phrase = normalizePhrase(value);
  const tokens = phrase.split(' ').filter(Boolean).map(normalizeToken);

  return {
    phrase,
    compact: phrase.replace(/\s/g, ''),
    tokens,
  };
}

function allTokensMatch(queryTokens: string[], candidate: SearchText): boolean {
  return queryTokens.every((token) => candidate.tokens.includes(token));
}

function partialMatch(query: SearchText, candidate: SearchText): boolean {
  if (!query.phrase) return false;
  if (candidate.phrase.includes(query.phrase) || candidate.compact.includes(query.compact)) {
    return true;
  }

  if (query.tokens.length < 2) return false;

  const matchCount = query.tokens.filter((token) => candidate.tokens.includes(token)).length;
  return matchCount >= 2 && matchCount >= query.tokens.length - 1;
}

function bestSearchScore(exercise: ExerciseRow, query: SearchText): number | null {
  const name = toSearchText(exercise.name);
  const aliases = (CURATED_EXERCISE_ALIASES[exercise.id] ?? []).map(toSearchText);
  const candidates = [name, ...aliases];

  if (name.phrase === query.phrase || name.compact === query.compact) {
    return 1;
  }

  if (name.phrase.startsWith(query.phrase) || name.compact.startsWith(query.compact)) {
    return 2;
  }

  if (aliases.some((alias) => alias.phrase === query.phrase || alias.compact === query.compact)) {
    return 3;
  }

  if (candidates.some((candidate) => allTokensMatch(query.tokens, candidate))) {
    return 4;
  }

  if (candidates.some((candidate) => partialMatch(query, candidate))) {
    return 5;
  }

  return null;
}

export function filterExercises(
  exercises: ExerciseRow[],
  query: string,
  exerciseType: ExerciseType | null,
  source: ExerciseSourceFilter,
): ExerciseRow[] {
  const normalizedQuery = toSearchText(query);
  const filtered = exercises.filter((exercise) => {
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

  if (normalizedQuery.phrase.length === 0) {
    return filtered
      .map((exercise, index) => ({ exercise, index }))
      .sort((a, b) => {
        const favoriteCompare = (b.exercise.is_favorite ?? 0) - (a.exercise.is_favorite ?? 0);
        if (favoriteCompare !== 0) return favoriteCompare;
        return a.index - b.index;
      })
      .map((result) => result.exercise);
  }

  return filtered
    .map((exercise, index) => ({
      exercise,
      index,
      score: bestSearchScore(exercise, normalizedQuery),
    }))
    .filter((result): result is { exercise: ExerciseRow; index: number; score: number } => {
      return result.score !== null;
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const favoriteCompare = (b.exercise.is_favorite ?? 0) - (a.exercise.is_favorite ?? 0);
      if (favoriteCompare !== 0) return favoriteCompare;
      if (a.exercise.is_custom !== b.exercise.is_custom) {
        return b.exercise.is_custom - a.exercise.is_custom;
      }
      return a.index - b.index;
    })
    .map((result) => result.exercise);
}
