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
import { addExerciseToDay, deleteDay, renameDay } from '../dayExerciseRepo';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import {
  addDayToWorkoutPlan,
  createWorkoutPlan,
  getWorkoutPlanById,
  listDaysForWorkoutPlan,
  listWorkoutPlansWithSessionCounts,
  saveCompletedQuickWorkoutAsPlan,
} from '../workoutPlanRepo';
import { completeSession, createSessionFromPlanDay } from '../workoutSessionRepo';
import {
  MAX_EXERCISES_PER_SESSION,
  WorkoutLimitError,
  WORKOUT_LIMIT_MESSAGES,
} from '../workoutLimits';

type CountRow = { n: number };
type DayRow = { id: string; day_index: number; name: string | null; deleted_at: string | null };
type EntityRow = { id: string; deleted_at: string | null };
type OutboxRow = {
  entity_type: string;
  entity_id: string;
  op_type: string;
  status: string;
  payload_json: string;
};

const exerciseId = 'ex_bench_press_barbell';
const rowingMachineId = 'ex_rowing_machine';
const treadmillId = 'ex_treadmill_run';

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
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

function addExerciseWithPlannedSets(dayId: string): string {
  const dayExerciseId = addExerciseToDay({ dayId, exerciseId });
  exec('DELETE FROM planned_set WHERE program_day_exercise_id = ?;', [dayExerciseId]);
  exec(
    `
    INSERT INTO planned_set (
      id,
      program_day_exercise_id,
      set_index,
      target_reps_min,
      target_reps_max,
      rest_seconds
    ) VALUES
      (?, ?, 1, 8, 8, NULL),
      (?, ?, 2, 10, 10, NULL);
  `,
    [`pset-${dayExerciseId}-1`, dayExerciseId, `pset-${dayExerciseId}-2`, dayExerciseId],
  );
  return dayExerciseId;
}

function seedDayExercisesDirectly(dayId: string, exerciseCount: number) {
  for (let index = 1; index <= exerciseCount; index += 1) {
    exec(
      `
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
      VALUES (?, ?, ?, ?, NULL);
    `,
      [`pde-direct-${index}`, dayId, exerciseId, index],
    );
  }
}

function readOutboxRows(): OutboxRow[] {
  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, op_type, status, payload_json
    FROM outbox_op
    ORDER BY created_at, id;
  `,
  );
}

function readCardioSessionExercise(sessionId: string, exerciseId: string) {
  return query<{
    id: string;
    cardio_duration_minutes: number | null;
    cardio_distance_km: number | null;
    cardio_speed_kph: number | null;
    cardio_incline_percent: number | null;
  }>(
    `
    SELECT
      id,
      cardio_duration_minutes,
      cardio_distance_km,
      cardio_speed_kph,
      cardio_incline_percent
    FROM workout_session_exercise
    WHERE workout_session_id = ? AND exercise_id = ?;
  `,
    [sessionId, exerciseId],
  )[0];
}

function seedCompletedCardioQuickWorkout(input: {
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  cardioProfile: string;
  durationMinutes: number | null;
  distanceKm: number | null;
}) {
  exec(
    `
    INSERT INTO workout_session (
      id,
      source_workout_plan_id,
      source_program_day_id,
      title,
      status,
      started_at,
      ended_at
    ) VALUES (?, NULL, NULL, 'Quick Workout', 'completed', '2026-01-03T10:00:00Z', '2026-01-03T11:00:00Z');
  `,
    [input.sessionId],
  );

  exec(
    `
    INSERT INTO workout_session_exercise (
      id,
      workout_session_id,
      source_program_day_exercise_id,
      exercise_id,
      exercise_name,
      exercise_type,
      cardio_profile,
      position,
      notes,
      cardio_duration_minutes,
      cardio_distance_km
    ) VALUES (?, ?, NULL, ?, ?, 'cardio', ?, 1, NULL, ?, ?);
  `,
    [
      `${input.sessionId}-wse`,
      input.sessionId,
      input.exerciseId,
      input.exerciseName,
      input.cardioProfile,
      input.durationMinutes,
      input.distanceKm,
    ],
  );
}

describe('plan session lifecycle with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('keeps a zero-session plan queryable after all sessions are deleted', () => {
    const planId = createWorkoutPlan({ name: 'Emptyable Plan', description: 'Plan can be empty' });
    const firstDayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!firstDayId) throw new Error('Expected createWorkoutPlan to create a first session');
    addExerciseWithPlannedSets(firstDayId);

    deleteDay(firstDayId);

    expect(getWorkoutPlanById(planId)).toEqual({
      id: planId,
      name: 'Emptyable Plan',
      description: 'Plan can be empty',
      is_template: 0,
    });
    expect(listDaysForWorkoutPlan(planId)).toEqual([]);
    expect(listWorkoutPlansWithSessionCounts().find((plan) => plan.id === planId)).toMatchObject({
      id: planId,
      name: 'Emptyable Plan',
      sessionCount: 0,
    });
    expect(
      query<{ deleted_at: string | null }>('SELECT deleted_at FROM program WHERE id = ?;', [
        planId,
      ])[0]?.deleted_at,
    ).toBeNull();
  });

  it('starts a planned session with exactly 50 day exercises', () => {
    const planId = createWorkoutPlan({ name: 'Full Plan' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected a plan day.');
    seedDayExercisesDirectly(dayId, MAX_EXERCISES_PER_SESSION);

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    expect(count('SELECT COUNT(*) AS n FROM workout_session WHERE id = ?;', [sessionId])).toBe(1);
    expect(
      count('SELECT COUNT(*) AS n FROM workout_session_exercise WHERE workout_session_id = ?;', [
        sessionId,
      ]),
    ).toBe(MAX_EXERCISES_PER_SESSION);
  });

  it('starts a reused rowing plan with duration and distance prefilled', () => {
    const planId = createWorkoutPlan({ name: 'Rowing Plan' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected a plan day.');
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
      ) VALUES ('pde-rowing', ?, ?, 1, NULL, 11, 11);
    `,
      [dayId, rowingMachineId],
    );

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    const cardio = query<{
      cardio_duration_minutes: number | null;
      cardio_distance_km: number | null;
      cardio_speed_kph: number | null;
      cardio_incline_percent: number | null;
    }>(
      `
      SELECT
        cardio_duration_minutes,
        cardio_distance_km,
        cardio_speed_kph,
        cardio_incline_percent
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND exercise_id = ?;
    `,
      [sessionId, rowingMachineId],
    )[0];
    expect(cardio).toEqual({
      cardio_duration_minutes: 11,
      cardio_distance_km: 11,
      cardio_speed_kph: null,
      cardio_incline_percent: null,
    });
    expect(
      count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?;
      `,
        [sessionId],
      ),
    ).toBe(0);
  });

  it('starts reused cardio quick workout plans from copied targets first, then latest actual values', async () => {
    seedCompletedCardioQuickWorkout({
      sessionId: 'quick-rowing',
      exerciseId: rowingMachineId,
      exerciseName: 'Rowing Machine',
      cardioProfile: 'ergometer',
      durationMinutes: 10,
      distanceKm: 2,
    });

    const result = await saveCompletedQuickWorkoutAsPlan({
      sessionId: 'quick-rowing',
      target: { kind: 'newPlan', name: 'Rowing Reuse Plan' },
    });

    const firstPlannedSessionId = createSessionFromPlanDay({
      workoutPlanId: result.workoutPlanId,
      dayId: result.programDayId,
    });
    const firstCardio = readCardioSessionExercise(firstPlannedSessionId, rowingMachineId);
    expect(firstCardio).toMatchObject({
      cardio_duration_minutes: 10,
      cardio_distance_km: 2,
      cardio_speed_kph: null,
      cardio_incline_percent: null,
    });

    exec(
      `
      UPDATE workout_session_exercise
      SET cardio_duration_minutes = 12,
          cardio_distance_km = 2.5
      WHERE id = ?;
    `,
      [firstCardio.id],
    );
    completeSession(firstPlannedSessionId, null);

    const secondPlannedSessionId = createSessionFromPlanDay({
      workoutPlanId: result.workoutPlanId,
      dayId: result.programDayId,
    });
    const secondCardio = readCardioSessionExercise(secondPlannedSessionId, rowingMachineId);
    expect(secondCardio).toMatchObject({
      cardio_duration_minutes: 12,
      cardio_distance_km: 2.5,
      cardio_speed_kph: null,
      cardio_incline_percent: null,
    });

    const savedPlanTargets = query<{
      planned_cardio_duration_minutes: number | null;
      planned_cardio_distance_km: number | null;
    }>(
      `
      SELECT planned_cardio_duration_minutes, planned_cardio_distance_km
      FROM program_day_exercise
      WHERE program_day_id = ? AND exercise_id = ?;
    `,
      [result.programDayId, rowingMachineId],
    )[0];
    expect(savedPlanTargets).toEqual({
      planned_cardio_duration_minutes: 10,
      planned_cardio_distance_km: 2,
    });
  });

  it('starts a reused treadmill plan with duration distance speed and incline prefilled', () => {
    const planId = createWorkoutPlan({ name: 'Treadmill Plan' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected a plan day.');
    exec(
      `
      INSERT INTO program_day_exercise (
        id,
        program_day_id,
        exercise_id,
        position,
        notes,
        planned_cardio_duration_minutes,
        planned_cardio_distance_km,
        planned_cardio_speed_kph,
        planned_cardio_incline_percent
      ) VALUES ('pde-treadmill', ?, ?, 1, NULL, 11, 11, 11, 11);
    `,
      [dayId, treadmillId],
    );

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    const cardio = query<{
      cardio_duration_minutes: number | null;
      cardio_distance_km: number | null;
      cardio_speed_kph: number | null;
      cardio_incline_percent: number | null;
    }>(
      `
      SELECT
        cardio_duration_minutes,
        cardio_distance_km,
        cardio_speed_kph,
        cardio_incline_percent
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND exercise_id = ?;
    `,
      [sessionId, treadmillId],
    )[0];
    expect(cardio).toEqual({
      cardio_duration_minutes: 11,
      cardio_distance_km: 11,
      cardio_speed_kph: 11,
      cardio_incline_percent: 11,
    });
  });

  it('starts existing cardio plans with null planned targets as empty cardio summaries', () => {
    const planId = createWorkoutPlan({ name: 'Empty Cardio Plan' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected a plan day.');
    exec(
      `
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
      VALUES ('pde-empty-cardio', ?, ?, 1, NULL);
    `,
      [dayId, rowingMachineId],
    );

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId });

    const cardio = query<{
      cardio_duration_minutes: number | null;
      cardio_distance_km: number | null;
      cardio_pace_seconds_per_km: number | null;
    }>(
      `
      SELECT
        cardio_duration_minutes,
        cardio_distance_km,
        cardio_pace_seconds_per_km
      FROM workout_session_exercise
      WHERE workout_session_id = ? AND exercise_id = ?;
    `,
      [sessionId, rowingMachineId],
    )[0];
    expect(cardio).toEqual({
      cardio_duration_minutes: null,
      cardio_distance_km: null,
      cardio_pace_seconds_per_km: null,
    });
  });

  it('rejects 51 day exercises before creating a partial planned session', () => {
    const planId = createWorkoutPlan({ name: 'Oversized Plan' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected a plan day.');
    seedDayExercisesDirectly(dayId, MAX_EXERCISES_PER_SESSION + 1);

    let thrown: unknown;
    try {
      createSessionFromPlanDay({ workoutPlanId: planId, dayId });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkoutLimitError);
    expect((thrown as Error).message).toBe(WORKOUT_LIMIT_MESSAGES.maxExercisesPerSession);
    expect(count('SELECT COUNT(*) AS n FROM workout_session;')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM workout_session_exercise;')).toBe(0);
  });

  it('tombstones a deleted session tree, preserves siblings and history, and enqueues sync rows', () => {
    const planId = createWorkoutPlan({ name: 'Lifecycle Plan' });
    const day1 = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!day1) throw new Error('Expected createWorkoutPlan to create Session 1');
    const day2 = addDayToWorkoutPlan(planId);
    const day3 = addDayToWorkoutPlan(planId);
    const day4 = addDayToWorkoutPlan(planId);
    renameDay(day4, 'Heavy Pull');

    addExerciseWithPlannedSets(day1);
    const deletedDayExerciseId = addExerciseWithPlannedSets(day2);
    addExerciseWithPlannedSets(day3);
    addExerciseWithPlannedSets(day4);

    const sessionId = createSessionFromPlanDay({ workoutPlanId: planId, dayId: day2 });
    exec(
      `
      UPDATE workout_set
      SET is_completed = 1
      WHERE workout_session_exercise_id IN (
        SELECT id FROM workout_session_exercise WHERE workout_session_id = ?
      );
    `,
      [sessionId],
    );
    completeSession(sessionId, 'completed before planner delete');
    const historyBefore = {
      sessions: count('SELECT COUNT(*) AS n FROM workout_session WHERE id = ?;', [sessionId]),
      sessionExercises: count(
        'SELECT COUNT(*) AS n FROM workout_session_exercise WHERE workout_session_id = ?;',
        [sessionId],
      ),
      sets: count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?;
      `,
        [sessionId],
      ),
    };

    exec('DELETE FROM outbox_op;');

    deleteDay(day2);

    const deletedDay = query<DayRow>(
      'SELECT id, day_index, name, deleted_at FROM program_day WHERE id = ?;',
      [day2],
    )[0];
    expect(deletedDay?.deleted_at).not.toBeNull();
    expect(deletedDay?.day_index).toBe(0);
    expect(listDaysForWorkoutPlan(planId).some((day) => day.id === day2)).toBe(false);

    const deletedDayExercises = query<EntityRow>(
      'SELECT id, deleted_at FROM program_day_exercise WHERE program_day_id = ?;',
      [day2],
    );
    expect(deletedDayExercises).toHaveLength(1);
    expect(deletedDayExercises.every((row) => row.deleted_at !== null)).toBe(true);

    const deletedPlannedSets = query<EntityRow>(
      'SELECT id, deleted_at FROM planned_set WHERE program_day_exercise_id = ? ORDER BY set_index;',
      [deletedDayExerciseId],
    );
    expect(deletedPlannedSets).toHaveLength(2);
    expect(deletedPlannedSets.every((row) => row.deleted_at !== null)).toBe(true);

    expect(listDaysForWorkoutPlan(planId)).toEqual([
      { id: day1, day_index: 1, name: 'Session 1' },
      { id: day3, day_index: 2, name: 'Session 2' },
      { id: day4, day_index: 3, name: 'Heavy Pull' },
    ]);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ? AND deleted_at IS NULL;', [day3]),
    ).toBe(1);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ? AND deleted_at IS NULL;', [day4]),
    ).toBe(1);

    const outboxRows = readOutboxRows();
    expect(outboxRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'planned_set',
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day_exercise',
          entity_id: deletedDayExerciseId,
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day2,
          op_type: 'delete',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day3,
          op_type: 'upsert',
          status: 'pending',
        }),
        expect.objectContaining({
          entity_type: 'program_day',
          entity_id: day4,
          op_type: 'upsert',
          status: 'pending',
        }),
      ]),
    );
    expect(outboxRows.filter((row) => row.entity_type === 'planned_set')).toHaveLength(2);
    for (const row of outboxRows) {
      const payload = JSON.parse(row.payload_json);
      if (row.op_type === 'delete') {
        expect(payload.deleted_at).not.toBeNull();
      }
      if (row.entity_type === 'program_day' && row.entity_id === day3) {
        expect(payload.day_index).toBe(2);
        expect(payload.name).toBe('Session 2');
      }
      if (row.entity_type === 'program_day' && row.entity_id === day4) {
        expect(payload.day_index).toBe(3);
        expect(payload.name).toBe('Heavy Pull');
      }
    }

    expect({
      sessions: count('SELECT COUNT(*) AS n FROM workout_session WHERE id = ?;', [sessionId]),
      sessionExercises: count(
        'SELECT COUNT(*) AS n FROM workout_session_exercise WHERE workout_session_id = ?;',
        [sessionId],
      ),
      sets: count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ?;
      `,
        [sessionId],
      ),
    }).toEqual(historyBefore);
    expect(
      query<{ status: string; deleted_at: string | null }>(
        'SELECT status, deleted_at FROM workout_session WHERE id = ?;',
        [sessionId],
      )[0],
    ).toEqual({ status: 'completed', deleted_at: null });
    expect(
      count(
        `
        SELECT COUNT(*) AS n
        FROM workout_session_exercise
        WHERE workout_session_id = ? AND deleted_at IS NOT NULL;
      `,
        [sessionId],
      ),
    ).toBe(0);
    expect(
      count(
        `
        SELECT COUNT(*) AS n
        FROM workout_set ws
        JOIN workout_session_exercise wse ON wse.id = ws.workout_session_exercise_id
        WHERE wse.workout_session_id = ? AND ws.deleted_at IS NOT NULL;
      `,
        [sessionId],
      ),
    ).toBe(0);
  });
});
