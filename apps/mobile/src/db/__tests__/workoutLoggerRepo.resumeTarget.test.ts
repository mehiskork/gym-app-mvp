jest.mock('../db', () => ({
  exec: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../tx', () => ({
  inTransaction: (fn: () => unknown) => fn(),
}));

jest.mock('../outboxRepo', () => ({
  enqueueOutboxOp: jest.fn(),
}));

jest.mock('../../utils/ids', () => ({
  newId: jest.fn(),
}));

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  reconcileUnfinishedWorkoutReminder: jest.fn(),
  scheduleUnfinishedWorkoutReminderForSession: jest.fn(),
}));

import type { LoggerExercise } from '../workoutLoggerRepo';
import { getResumeProgressTargetExerciseId } from '../workoutLoggerRepo';

const cardioSummary = {
  duration_minutes: null,
  distance_km: null,
  speed_kph: null,
  incline_percent: null,
  resistance_level: null,
  pace_seconds_per_km: null,
  floors: null,
  stair_level: null,
};

function strengthExercise(input: {
  id: string;
  position: number;
  completedSetIndexes?: number[];
}): LoggerExercise {
  return {
    id: input.id,
    exercise_id: `${input.id}-template`,
    exercise_name: input.id,
    exercise_type: 'strength',
    cardio_profile: null,
    position: input.position,
    notes: null,
    plan_note_snapshot: null,
    cardio_summary: cardioSummary,
    sets: [1, 2, 3].map((setIndex) => ({
      id: `${input.id}-set-${setIndex}`,
      workout_session_exercise_id: input.id,
      set_index: setIndex,
      weight: 100,
      reps: 5,
      rpe: null,
      rest_seconds: 90,
      notes: null,
      is_completed: input.completedSetIndexes?.includes(setIndex) ? 1 : 0,
    })),
  };
}

function cardioExercise(input: { id: string; position: number }): LoggerExercise {
  return {
    id: input.id,
    exercise_id: `${input.id}-template`,
    exercise_name: input.id,
    exercise_type: 'cardio',
    cardio_profile: 'bike',
    position: input.position,
    notes: null,
    plan_note_snapshot: null,
    cardio_summary: cardioSummary,
    sets: [],
  };
}

describe('getResumeProgressTargetExerciseId', () => {
  it('returns null when there is no completed strength set or cardio progress', () => {
    expect(
      getResumeProgressTargetExerciseId({
        exercises: [
          strengthExercise({ id: 'bench', position: 1 }),
          cardioExercise({ id: 'bike', position: 2 }),
        ],
        cardioProgressExerciseIds: new Set(),
      }),
    ).toBeNull();
  });

  it('chooses completed strength by highest exercise position before set index', () => {
    expect(
      getResumeProgressTargetExerciseId({
        exercises: [
          strengthExercise({ id: 'bench', position: 1, completedSetIndexes: [3] }),
          strengthExercise({ id: 'squat', position: 3, completedSetIndexes: [1] }),
          strengthExercise({ id: 'row', position: 2, completedSetIndexes: [2, 3] }),
        ],
        cardioProgressExerciseIds: new Set(),
      }),
    ).toBe('squat');
  });

  it('uses highest set index when completed strength sets share an exercise position', () => {
    expect(
      getResumeProgressTargetExerciseId({
        exercises: [
          {
            ...strengthExercise({ id: 'bench-a', position: 2, completedSetIndexes: [1] }),
            id: 'bench-a',
          },
          {
            ...strengthExercise({ id: 'bench-b', position: 2, completedSetIndexes: [3] }),
            id: 'bench-b',
          },
        ],
        cardioProgressExerciseIds: new Set(),
      }),
    ).toBe('bench-b');
  });

  it('falls back to latest cardio progress by exercise position', () => {
    expect(
      getResumeProgressTargetExerciseId({
        exercises: [
          cardioExercise({ id: 'bike', position: 1 }),
          cardioExercise({ id: 'rower', position: 3 }),
          cardioExercise({ id: 'treadmill', position: 2 }),
        ],
        cardioProgressExerciseIds: new Set(['bike', 'treadmill']),
      }),
    ).toBe('treadmill');
  });

  it('prefers completed strength over cardio progress for the MVP', () => {
    expect(
      getResumeProgressTargetExerciseId({
        exercises: [
          strengthExercise({ id: 'bench', position: 1, completedSetIndexes: [1] }),
          cardioExercise({ id: 'bike', position: 5 }),
        ],
        cardioProgressExerciseIds: new Set(['bike']),
      }),
    ).toBe('bench');
  });
});
