jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

  return {
    openDatabaseSync: jest.fn(() => {
      const database = new DatabaseSync(':memory:');

      return {
        execSync: (sql: string) => {
          database.exec(sql);
        },
        prepareSync: (sql: string) => {
          const statement = database.prepare(sql);

          return {
            executeSync: (params: unknown[] = []) => {
              const normalized = sql.trim().toUpperCase();
              const bindParams = (Array.isArray(params) ? params : [params]) as Parameters<
                typeof statement.all
              >;

              if (
                normalized.startsWith('SELECT') ||
                normalized.startsWith('PRAGMA') ||
                normalized.startsWith('WITH')
              ) {
                return statement.all(...bindParams);
              }

              statement.run(...(bindParams as Parameters<typeof statement.run>));
              return [];
            },
            finalizeSync: jest.fn(),
          };
        },
      };
    }),
  };
});

jest.mock('../../sync/syncScheduler', () => ({
  scheduleSyncSoon: jest.fn(),
}));

jest.mock('../../utils/restTimerNotifications', () => ({
  cancelUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
  scheduleUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
}));

import { v4 as uuidv4 } from 'uuid';

import { addExerciseToDay } from '../dayExerciseRepo';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import { createWorkoutPlan, listDaysForWorkoutPlan } from '../workoutPlanRepo';
import {
  createQuickWorkoutSessionWithExercise,
  createSessionFromPlanDay,
  discardSessionIfNoMeaningfulActivity,
  getInProgressSession,
  getWorkoutSessionExerciseCardioProgressIds,
  hasMeaningfulWorkoutActivity,
} from '../workoutSessionRepo';
import {
  appendWorkoutSessionExercise,
  deleteWorkoutSessionExercise,
  updateWorkoutSessionExerciseCardioSummary,
  updateWorkoutSessionExerciseComment,
  updateWorkoutSet,
} from '../workoutLoggerRepo';

const benchId = 'ex_bench_press_barbell';
const curlId = 'ex_ez_bar_curl';
const rowingId = 'ex_rowing_machine';
const treadmillId = 'ex_treadmill_run';

type CountRow = { n: number };

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
}

function snapshotCount(sessionId: string): number {
  return count(
    'SELECT COUNT(*) AS n FROM workout_session_initial_snapshot WHERE workout_session_id = ?;',
    [sessionId],
  );
}

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function migrateAndSeed() {
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
}

function createPlanDayWithBenchAndRowing(): { planId: string; dayId: string } {
  const planId = createWorkoutPlan({ name: 'Auto discard plan' });
  const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
  if (!dayId) throw new Error('Expected plan day');

  const benchDayExerciseId = addExerciseToDay({ dayId, exerciseId: benchId });
  exec('DELETE FROM planned_set WHERE program_day_exercise_id = ?;', [benchDayExerciseId]);
  exec(
    `
    INSERT INTO planned_set (
      id,
      program_day_exercise_id,
      set_index,
      target_weight,
      target_reps_min,
      target_reps_max,
      rest_seconds
    ) VALUES (?, ?, 1, 80, 8, 8, 120);
  `,
    ['planned-bench-set', benchDayExerciseId],
  );

  exec(
    `
    INSERT INTO program_day_exercise (
      id,
      program_day_id,
      exercise_id,
      position,
      notes,
      planned_cardio_duration_minutes,
      planned_cardio_distance_km
    ) VALUES ('pde-rowing', ?, ?, 2, NULL, 10, 2);
  `,
    [dayId, rowingId],
  );

  return { planId, dayId };
}

function firstSetId(sessionId: string): string {
  return query<{ id: string }>(
    `
    SELECT ws.id
    FROM workout_set ws
    JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
    WHERE wse.workout_session_id = ?
      AND ws.deleted_at IS NULL
    ORDER BY ws.set_index ASC
    LIMIT 1;
  `,
    [sessionId],
  )[0].id;
}

function exerciseIdFor(sessionId: string, exerciseId: string): string {
  return query<{ id: string }>(
    `
    SELECT id
    FROM workout_session_exercise
    WHERE workout_session_id = ?
      AND exercise_id = ?
      AND deleted_at IS NULL
    LIMIT 1;
  `,
    [sessionId, exerciseId],
  )[0].id;
}

describe('empty active workout auto-discard', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('discards an untouched planned workout with only prefilled values', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    expect(hasMeaningfulWorkoutActivity(sessionId)).toBe(false);
    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(true);
    expect(getInProgressSession()).toBeNull();
    expect(count("SELECT COUNT(*) AS n FROM workout_session WHERE status = 'completed';")).toBe(0);
  });

  it('discards an untouched planned workout during active lookup stale cleanup', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    expect(snapshotCount(sessionId)).toBe(1);
    expect(getInProgressSession()).toBeNull();
    expect(snapshotCount(sessionId)).toBe(0);
    expect(
      count(
        "SELECT COUNT(*) AS n FROM workout_session WHERE id = ? AND status = 'discarded' AND deleted_at IS NOT NULL;",
        [sessionId],
      ),
    ).toBe(1);
  });

  it('keeps a planned workout when weight changes without a checked set', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    updateWorkoutSet(firstSetId(sessionId), { weight: 85 });

    expect(hasMeaningfulWorkoutActivity(sessionId)).toBe(true);
    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps a planned workout when reps change without a checked set', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    updateWorkoutSet(firstSetId(sessionId), { reps: 9 });

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps a planned workout when cardio changes from the prefilled value', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    updateWorkoutSessionExerciseCardioSummary(exerciseIdFor(sessionId, rowingId), {
      distance_km: 2.5,
    });

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('does not count unchanged planned cardio prefill as resume progress', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    expect(getWorkoutSessionExerciseCardioProgressIds(sessionId)).toEqual(new Set());
  });

  it('counts planned cardio changed from the initial snapshot as resume progress', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });
    const cardioExerciseId = exerciseIdFor(sessionId, rowingId);

    updateWorkoutSessionExerciseCardioSummary(cardioExerciseId, {
      distance_km: 2.5,
    });

    expect(getWorkoutSessionExerciseCardioProgressIds(sessionId)).toEqual(
      new Set([cardioExerciseId]),
    );
  });

  it('keeps a planned workout when a workout or exercise note changes', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    exec(
      "UPDATE workout_session SET workout_note = ?, updated_at = datetime('now') WHERE id = ?;",
      ['Felt good', sessionId],
    );

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps a planned workout when an exercise workout note changes', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    updateWorkoutSessionExerciseComment(exerciseIdFor(sessionId, benchId), 'Use pause reps');

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps a planned workout when the user manually adds an exercise', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    appendWorkoutSessionExercise({
      workoutSessionId: sessionId,
      exerciseId: curlId,
      exerciseName: 'Barbell Curl',
    });

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps a planned workout when an original exercise is deleted', () => {
    const { planId, dayId } = createPlanDayWithBenchAndRowing();
    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    deleteWorkoutSessionExercise(sessionId, exerciseIdFor(sessionId, benchId));

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps Quick Workout active after selecting an exercise', () => {
    const { sessionId } = createQuickWorkoutSessionWithExercise({
      exerciseId: benchId,
      exerciseName: 'Barbell Bench Press',
    });

    expect(hasMeaningfulWorkoutActivity(sessionId)).toBe(true);
    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('keeps Quick Workout active after selecting a cardio exercise without values', () => {
    const { sessionId } = createQuickWorkoutSessionWithExercise({
      exerciseId: treadmillId,
      exerciseName: 'Treadmill',
    });

    expect(discardSessionIfNoMeaningfulActivity(sessionId)).toBe(false);
    expect(getInProgressSession()?.id).toBe(sessionId);
  });

  it('discards a Quick Workout when all user-added exercises are deleted without other activity', () => {
    const { sessionId, focusExerciseId } = createQuickWorkoutSessionWithExercise({
      exerciseId: benchId,
      exerciseName: 'Barbell Bench Press',
    });

    expect(snapshotCount(sessionId)).toBe(1);
    expect(deleteWorkoutSessionExercise(sessionId, focusExerciseId)).toEqual({
      deleted: true,
      discardedSession: true,
    });
    expect(getInProgressSession()).toBeNull();
    expect(snapshotCount(sessionId)).toBe(0);
  });

  it('keeps legacy planned sessions without snapshots active', () => {
    exec(
      `
      INSERT INTO workout_session (
        id,
        source_workout_plan_id,
        source_program_day_id,
        title,
        status,
        started_at,
        workout_note
      ) VALUES ('legacy-planned', 'plan-legacy', 'day-legacy', 'Legacy', 'in_progress', datetime('now'), NULL);
    `,
    );

    expect(discardSessionIfNoMeaningfulActivity('legacy-planned')).toBe(false);
    expect(getInProgressSession()?.id).toBe('legacy-planned');
  });
});
