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

import { v4 as uuidv4 } from 'uuid';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import {
  addDayToWorkoutPlan,
  createWorkoutPlan,
  listDaysForWorkoutPlan,
  saveCompletedWorkoutAsPlan,
} from '../workoutPlanRepo';
import { MAX_SESSIONS_PER_PLAN, WorkoutLimitError } from '../workoutLimits';
import { SYNC_BATCH_LIMIT } from '../../sync/constants';

type CountRow = { n: number };
type OutboxRow = {
  entity_type: string;
  entity_id: string;
  payload_json: string;
};
type PlannedSetRow = {
  set_index: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
};
type PlannedCardioTargetRow = {
  exercise_id: string;
  position: number;
  planned_cardio_duration_minutes: number | null;
  planned_cardio_distance_km: number | null;
  planned_cardio_speed_kph: number | null;
  planned_cardio_incline_percent: number | null;
  planned_cardio_resistance_level: number | null;
  planned_cardio_pace_seconds_per_km: number | null;
  planned_cardio_floors: number | null;
  planned_cardio_stair_level: number | null;
};

const benchId = 'ex_bench_press_barbell';
const rowId = 'ex_bent_over_row_barbell';
const rowingMachineId = 'ex_rowing_machine';
const treadmillId = 'ex_treadmill_run';

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function migrateAndSeed() {
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
}

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
}

function seedCompletedQuickWorkout(sessionId = 'quick-1') {
  exec(
    `
    INSERT INTO workout_session (
      id,
      source_workout_plan_id,
      source_program_day_id,
      title,
      status,
      started_at,
      ended_at,
      workout_note,
      rest_timer_end_at,
      rest_timer_seconds,
      rest_timer_label
    ) VALUES (?, NULL, NULL, 'Quick Workout', 'completed', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'Do not copy', '2026-01-01T11:02:00Z', 120, 'Bench');
  `,
    [sessionId],
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
      notes
    ) VALUES
      ('wse-bench-1', ?, NULL, ?, 'Bench Press', 'strength', NULL, 1, 'Do not copy'),
      ('wse-row-1', ?, NULL, ?, 'Barbell Row', 'strength', NULL, 2, NULL),
      ('wse-bench-2', ?, NULL, ?, 'Bench Press', 'strength', NULL, 3, NULL);
  `,
    [sessionId, benchId, sessionId, rowId, sessionId, benchId],
  );

  exec(
    `
    INSERT INTO workout_set (
      id,
      workout_session_exercise_id,
      set_index,
      weight,
      reps,
      rpe,
      rest_seconds,
      notes,
      is_completed
    ) VALUES
      ('set-bench-1', 'wse-bench-1', 1, 100, 5, 8, 90, 'Do not copy', 1),
      ('set-bench-2', 'wse-bench-1', 2, 105, 4, 9, 120, NULL, 0),
      ('set-bench-3', 'wse-bench-1', 3, NULL, NULL, NULL, 180, NULL, 1),
      ('set-row-1', 'wse-row-1', 1, 80, 8, 7, 60, NULL, 1),
      ('set-bench-dup-1', 'wse-bench-2', 1, 90, 10, NULL, 75, NULL, 1);
  `,
  );

  return sessionId;
}

function seedLargeCompletedQuickWorkout(sessionId = 'quick-large') {
  const setsPerExercise = Math.ceil((SYNC_BATCH_LIMIT + 1) / 3);

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
    ) VALUES (?, NULL, NULL, 'Quick Workout', 'completed', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z');
  `,
    [sessionId],
  );

  for (let exerciseIndex = 1; exerciseIndex <= 3; exerciseIndex += 1) {
    const sessionExerciseId = `large-wse-${exerciseIndex}`;
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
        notes
      ) VALUES (?, ?, NULL, ?, ?, 'strength', NULL, ?, NULL);
    `,
      [
        sessionExerciseId,
        sessionId,
        exerciseIndex === 2 ? rowId : benchId,
        exerciseIndex === 2 ? 'Barbell Row' : 'Bench Press',
        exerciseIndex,
      ],
    );

    for (let setIndex = 1; setIndex <= setsPerExercise; setIndex += 1) {
      exec(
        `
        INSERT INTO workout_set (
          id,
          workout_session_exercise_id,
          set_index,
          weight,
          reps,
          is_completed
        ) VALUES (?, ?, ?, ?, ?, 1);
      `,
        [
          `large-set-${exerciseIndex}-${setIndex}`,
          sessionExerciseId,
          setIndex,
          100 + exerciseIndex,
          setIndex,
        ],
      );
    }
  }

  return sessionId;
}

function seedCompletedCardioQuickWorkout(input: {
  sessionId?: string;
  exerciseId: string;
  exerciseName: string;
  cardioProfile: string;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  speedKph?: number | null;
  inclinePercent?: number | null;
  resistanceLevel?: number | null;
  paceSecondsPerKm?: number | null;
  floors?: number | null;
  stairLevel?: number | null;
}) {
  const sessionId = input.sessionId ?? 'quick-cardio';
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
    [sessionId],
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
      cardio_distance_km,
      cardio_speed_kph,
      cardio_incline_percent,
      cardio_resistance_level,
      cardio_pace_seconds_per_km,
      cardio_floors,
      cardio_stair_level
    ) VALUES (?, ?, NULL, ?, ?, 'cardio', ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      `${sessionId}-wse`,
      sessionId,
      input.exerciseId,
      input.exerciseName,
      input.cardioProfile,
      input.durationMinutes ?? null,
      input.distanceKm ?? null,
      input.speedKph ?? null,
      input.inclinePercent ?? null,
      input.resistanceLevel ?? null,
      input.paceSecondsPerKm ?? null,
      input.floors ?? null,
      input.stairLevel ?? null,
    ],
  );

  return sessionId;
}

function seedCompletedMixedQuickWorkout(sessionId = 'quick-mixed') {
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
    ) VALUES (?, NULL, NULL, 'Quick Workout', 'completed', '2026-01-04T10:00:00Z', '2026-01-04T11:00:00Z');
  `,
    [sessionId],
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
    ) VALUES
      ('wse-mixed-bench', ?, NULL, ?, 'Bench Press', 'strength', NULL, 1, NULL, NULL, NULL),
      ('wse-mixed-rowing', ?, NULL, ?, 'Rowing Machine', 'cardio', 'ergometer', 2, NULL, 11, 11);
  `,
    [sessionId, benchId, sessionId, rowingMachineId],
  );

  exec(
    `
    INSERT INTO workout_set (
      id,
      workout_session_exercise_id,
      set_index,
      weight,
      reps,
      is_completed
    ) VALUES ('set-mixed-bench', 'wse-mixed-bench', 1, 80, 8, 1);
  `,
  );

  return sessionId;
}

function readOutboxRows(limit?: number): OutboxRow[] {
  if (limit !== undefined) {
    return query<OutboxRow>(
      `
      SELECT entity_type, entity_id, payload_json
      FROM outbox_op
      ORDER BY created_at, rowid
      LIMIT ?;
    `,
      [limit],
    );
  }

  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, payload_json
    FROM outbox_op
    ORDER BY created_at, rowid;
  `,
  );
}

function expectGroupedPlannerOrder(entityTypes: string[], prefix: string[]) {
  expect(entityTypes.slice(0, prefix.length)).toEqual(prefix);

  const firstDayExercise = entityTypes.indexOf('program_day_exercise');
  const firstPlannedSet = entityTypes.indexOf('planned_set');
  expect(firstDayExercise).toBeGreaterThanOrEqual(prefix.length);
  expect(firstPlannedSet).toBeGreaterThan(firstDayExercise);
  expect(entityTypes.slice(prefix.length, firstPlannedSet)).toEqual(
    expect.arrayContaining(['program_day_exercise']),
  );
  expect(
    entityTypes
      .slice(prefix.length, firstPlannedSet)
      .every((type) => type === 'program_day_exercise'),
  ).toBe(true);
  expect(entityTypes.slice(firstPlannedSet).every((type) => type === 'planned_set')).toBe(true);
}

describe('saveCompletedWorkoutAsPlan', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('converts a completed Quick Workout into a new plan with copied strength exercises and planned sets', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('DELETE FROM outbox_op;');

    const result = await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Quick Workout Plan' },
    });

    expect(result.createdPlan).toBe(true);
    expect(count('SELECT COUNT(*) AS n FROM program WHERE id = ?;', [result.workoutPlanId])).toBe(
      1,
    );
    expect(
      count('SELECT COUNT(*) AS n FROM program_week WHERE program_id = ?;', [result.workoutPlanId]),
    ).toBe(1);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ?;', [result.programDayId]),
    ).toBe(1);

    const dayExercises = query<{ exercise_id: string; position: number; notes: string | null }>(
      `
      SELECT exercise_id, position, notes
      FROM program_day_exercise
      WHERE program_day_id = ?
      ORDER BY position ASC;
    `,
      [result.programDayId],
    );
    expect(dayExercises).toEqual([
      { exercise_id: benchId, position: 1, notes: null },
      { exercise_id: rowId, position: 2, notes: null },
      { exercise_id: benchId, position: 3, notes: null },
    ]);

    const plannedSets = query<PlannedSetRow>(
      `
      SELECT ps.set_index, ps.target_reps_min, ps.target_reps_max, ps.target_weight, ps.target_rpe, ps.rest_seconds
      FROM planned_set ps
      JOIN program_day_exercise pde ON pde.id = ps.program_day_exercise_id
      WHERE pde.program_day_id = ?
      ORDER BY pde.position ASC, ps.set_index ASC;
    `,
      [result.programDayId],
    );
    expect(plannedSets).toEqual([
      {
        set_index: 1,
        target_reps_min: 5,
        target_reps_max: 5,
        target_weight: 100,
        target_rpe: null,
        rest_seconds: 90,
      },
      {
        set_index: 1,
        target_reps_min: 8,
        target_reps_max: 8,
        target_weight: 80,
        target_rpe: null,
        rest_seconds: 60,
      },
      {
        set_index: 1,
        target_reps_min: 10,
        target_reps_max: 10,
        target_weight: 90,
        target_rpe: null,
        rest_seconds: 75,
      },
    ]);
  });

  it('converts a rowing cardio-only Quick Workout into planned cardio targets', async () => {
    const sessionId = seedCompletedCardioQuickWorkout({
      sessionId: 'quick-rowing',
      exerciseId: rowingMachineId,
      exerciseName: 'Rowing Machine',
      cardioProfile: 'ergometer',
      durationMinutes: 11,
      distanceKm: 11,
    });
    exec('DELETE FROM outbox_op;');

    const result = await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Rowing Plan' },
    });

    const targets = query<PlannedCardioTargetRow>(
      `
      SELECT
        exercise_id,
        position,
        planned_cardio_duration_minutes,
        planned_cardio_distance_km,
        planned_cardio_speed_kph,
        planned_cardio_incline_percent,
        planned_cardio_resistance_level,
        planned_cardio_pace_seconds_per_km,
        planned_cardio_floors,
        planned_cardio_stair_level
      FROM program_day_exercise
      WHERE program_day_id = ?
      ORDER BY position ASC;
    `,
      [result.programDayId],
    );
    expect(targets).toEqual([
      {
        exercise_id: rowingMachineId,
        position: 1,
        planned_cardio_duration_minutes: 11,
        planned_cardio_distance_km: 11,
        planned_cardio_speed_kph: null,
        planned_cardio_incline_percent: null,
        planned_cardio_resistance_level: null,
        planned_cardio_pace_seconds_per_km: null,
        planned_cardio_floors: null,
        planned_cardio_stair_level: null,
      },
    ]);
    expect(count('SELECT COUNT(*) AS n FROM planned_set;')).toBe(0);

    const dayExercisePayload = readOutboxRows()
      .filter((row) => row.entity_type === 'program_day_exercise')
      .map((row) => JSON.parse(row.payload_json))[0];
    expect(dayExercisePayload).toMatchObject({
      planned_cardio_duration_minutes: 11,
      planned_cardio_distance_km: 11,
      planned_cardio_speed_kph: null,
    });
  });

  it('copies treadmill cardio duration distance speed and incline targets', async () => {
    const sessionId = seedCompletedCardioQuickWorkout({
      sessionId: 'quick-treadmill',
      exerciseId: treadmillId,
      exerciseName: 'Treadmill',
      cardioProfile: 'treadmill',
      durationMinutes: 11,
      distanceKm: 11,
      speedKph: 11,
      inclinePercent: 11,
    });

    const result = await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Treadmill Plan' },
    });

    const target = query<PlannedCardioTargetRow>(
      `
      SELECT
        exercise_id,
        position,
        planned_cardio_duration_minutes,
        planned_cardio_distance_km,
        planned_cardio_speed_kph,
        planned_cardio_incline_percent,
        planned_cardio_resistance_level,
        planned_cardio_pace_seconds_per_km,
        planned_cardio_floors,
        planned_cardio_stair_level
      FROM program_day_exercise
      WHERE program_day_id = ?
      LIMIT 1;
    `,
      [result.programDayId],
    )[0];
    expect(target).toMatchObject({
      exercise_id: treadmillId,
      position: 1,
      planned_cardio_duration_minutes: 11,
      planned_cardio_distance_km: 11,
      planned_cardio_speed_kph: 11,
      planned_cardio_incline_percent: 11,
    });
  });

  it('reuses mixed strength and cardio work in performed order', async () => {
    const sessionId = seedCompletedMixedQuickWorkout();

    const result = await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Mixed Plan' },
    });

    const dayExercises = query<PlannedCardioTargetRow>(
      `
      SELECT
        exercise_id,
        position,
        planned_cardio_duration_minutes,
        planned_cardio_distance_km,
        planned_cardio_speed_kph,
        planned_cardio_incline_percent,
        planned_cardio_resistance_level,
        planned_cardio_pace_seconds_per_km,
        planned_cardio_floors,
        planned_cardio_stair_level
      FROM program_day_exercise
      WHERE program_day_id = ?
      ORDER BY position ASC;
    `,
      [result.programDayId],
    );
    expect(dayExercises).toEqual([
      {
        exercise_id: benchId,
        position: 1,
        planned_cardio_duration_minutes: null,
        planned_cardio_distance_km: null,
        planned_cardio_speed_kph: null,
        planned_cardio_incline_percent: null,
        planned_cardio_resistance_level: null,
        planned_cardio_pace_seconds_per_km: null,
        planned_cardio_floors: null,
        planned_cardio_stair_level: null,
      },
      {
        exercise_id: rowingMachineId,
        position: 2,
        planned_cardio_duration_minutes: 11,
        planned_cardio_distance_km: 11,
        planned_cardio_speed_kph: null,
        planned_cardio_incline_percent: null,
        planned_cardio_resistance_level: null,
        planned_cardio_pace_seconds_per_km: null,
        planned_cardio_floors: null,
        planned_cardio_stair_level: null,
      },
    ]);

    const plannedSets = query<PlannedSetRow>(
      `
      SELECT ps.set_index, ps.target_reps_min, ps.target_reps_max, ps.target_weight, ps.target_rpe, ps.rest_seconds
      FROM planned_set ps
      JOIN program_day_exercise pde ON pde.id = ps.program_day_exercise_id
      WHERE pde.program_day_id = ?
      ORDER BY pde.position ASC, ps.set_index ASC;
    `,
      [result.programDayId],
    );
    expect(plannedSets).toEqual([
      {
        set_index: 1,
        target_reps_min: 8,
        target_reps_max: 8,
        target_weight: 80,
        target_rpe: null,
        rest_seconds: null,
      },
    ]);
  });

  it('appends the copied session to an existing plan week 1', async () => {
    const sessionId = seedCompletedQuickWorkout();
    const planId = createWorkoutPlan({ name: 'Existing Plan' });
    const beforeDays = listDaysForWorkoutPlan(planId);
    exec('DELETE FROM outbox_op;');

    const result = await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'existingPlan', workoutPlanId: planId },
    });

    expect(result).toMatchObject({
      workoutPlanId: planId,
      createdPlan: false,
    });
    expect(listDaysForWorkoutPlan(planId)).toHaveLength(beforeDays.length + 1);
    expect(
      count('SELECT COUNT(*) AS n FROM program_day_exercise WHERE program_day_id = ?;', [
        result.programDayId,
      ]),
    ).toBe(3);

    const entityTypes = readOutboxRows().map((row) => row.entity_type);
    expectGroupedPlannerOrder(entityTypes, ['program_day']);
  });

  it('enqueues planner outbox snapshots for inserted entities', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('DELETE FROM outbox_op;');

    await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Synced Plan' },
    });

    const entityTypes = readOutboxRows().map((row) => row.entity_type);
    expect(entityTypes).toEqual([
      'program',
      'program_week',
      'program_day',
      'program_day_exercise',
      'program_day_exercise',
      'program_day_exercise',
      'planned_set',
      'planned_set',
      'planned_set',
    ]);
    expect(entityTypes.filter((type) => type === 'program')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_week')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_day')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_day_exercise')).toHaveLength(3);
    expect(entityTypes.filter((type) => type === 'planned_set')).toHaveLength(3);
    expect(
      readOutboxRows()
        .filter((row) => row.entity_type === 'planned_set')
        .map((row) => JSON.parse(row.payload_json).rest_seconds),
    ).toEqual([90, 60, 75]);
  });

  it('enqueues a created week before the appended day and copied children', async () => {
    const sessionId = seedCompletedQuickWorkout();
    const planId = 'existing-plan-without-week';
    exec(
      `
      INSERT INTO program (id, name, description, is_template, owner_user_id)
      VALUES (?, 'Existing Plan Without Week', NULL, 0, NULL);
    `,
      [planId],
    );
    exec('DELETE FROM outbox_op;');

    await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'existingPlan', workoutPlanId: planId },
    });

    const entityTypes = readOutboxRows().map((row) => row.entity_type);
    expectGroupedPlannerOrder(entityTypes, ['program_week', 'program_day']);
  });

  it('keeps parent snapshots in the first sync-sized slice for large reused workouts', async () => {
    const sessionId = seedLargeCompletedQuickWorkout();
    exec('DELETE FROM outbox_op;');

    await saveCompletedWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Large Synced Plan' },
    });

    const allEntityTypes = readOutboxRows().map((row) => row.entity_type);
    expect(allEntityTypes.length).toBeGreaterThan(SYNC_BATCH_LIMIT);

    const firstSyncSlice = readOutboxRows(SYNC_BATCH_LIMIT).map((row) => row.entity_type);
    expect(firstSyncSlice.slice(0, 3)).toEqual(['program', 'program_week', 'program_day']);

    const lastDayExerciseIndex = firstSyncSlice.lastIndexOf('program_day_exercise');
    const firstPlannedSetIndex = firstSyncSlice.indexOf('planned_set');
    expect(lastDayExerciseIndex).toBeGreaterThan(2);
    expect(firstPlannedSetIndex).toBeGreaterThan(lastDayExerciseIndex);
    expect(
      firstSyncSlice
        .slice(3, firstPlannedSetIndex)
        .every((type) => type === 'program_day_exercise'),
    ).toBe(true);
  });

  it('rejects a full existing plan atomically', async () => {
    const sessionId = seedCompletedQuickWorkout();
    const planId = createWorkoutPlan({ name: 'Full Plan' });
    for (let index = 1; index < MAX_SESSIONS_PER_PLAN; index += 1) {
      addDayToWorkoutPlan(planId);
    }
    exec('DELETE FROM outbox_op;');
    const before = {
      days: count('SELECT COUNT(*) AS n FROM program_day WHERE deleted_at IS NULL;'),
      dayExercises: count('SELECT COUNT(*) AS n FROM program_day_exercise;'),
      plannedSets: count('SELECT COUNT(*) AS n FROM planned_set;'),
    };

    await expect(
      saveCompletedWorkoutAsPlan({
        sessionId,
        target: { kind: 'existingPlan', workoutPlanId: planId },
      }),
    ).rejects.toBeInstanceOf(WorkoutLimitError);

    expect({
      days: count('SELECT COUNT(*) AS n FROM program_day WHERE deleted_at IS NULL;'),
      dayExercises: count('SELECT COUNT(*) AS n FROM program_day_exercise;'),
      plannedSets: count('SELECT COUNT(*) AS n FROM planned_set;'),
    }).toEqual(before);
    expect(readOutboxRows()).toHaveLength(0);
  });

  it('reuses completed Planned Workout sources and still rejects incomplete or deleted sources', async () => {
    const quickSessionId = seedCompletedQuickWorkout();
    const planId = createWorkoutPlan({ name: 'Plan Source' });
    const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
    if (!dayId) throw new Error('Expected seeded day.');

    exec(
      `
      UPDATE workout_session
      SET source_workout_plan_id = ?, source_program_day_id = ?
      WHERE id = ?;
    `,
      [planId, dayId, quickSessionId],
    );

    const plannedResult = await saveCompletedWorkoutAsPlan({
      sessionId: quickSessionId,
      target: { kind: 'newPlan', name: 'Planned Reuse' },
    });
    expect(
      count('SELECT COUNT(*) AS n FROM program_day WHERE id = ?;', [plannedResult.programDayId]),
    ).toBe(1);

    exec(
      `
      UPDATE workout_session
      SET source_workout_plan_id = NULL,
          source_program_day_id = NULL,
          status = 'in_progress'
      WHERE id = ?;
    `,
      [quickSessionId],
    );

    await expect(
      saveCompletedWorkoutAsPlan({
        sessionId: quickSessionId,
        target: { kind: 'newPlan', name: 'Rejected' },
      }),
    ).rejects.toThrow('No completed sets or cardio details to reuse.');

    exec(
      `
      UPDATE workout_session
      SET status = 'completed',
          deleted_at = datetime('now')
      WHERE id = ?;
    `,
      [quickSessionId],
    );

    await expect(
      saveCompletedWorkoutAsPlan({
        sessionId: quickSessionId,
        target: { kind: 'newPlan', name: 'Rejected' },
      }),
    ).rejects.toThrow('No completed sets or cardio details to reuse.');
  });

  it('skips empty cardio exercises and rejects workouts with no reusable work', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('UPDATE workout_set SET is_completed = 0;');
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
        notes
      ) VALUES ('wse-empty-cardio', ?, NULL, ?, 'Rowing Machine', 'cardio', 'ergometer', 4, NULL);
    `,
      [sessionId, rowingMachineId],
    );

    await expect(
      saveCompletedWorkoutAsPlan({
        sessionId,
        target: { kind: 'newPlan', name: 'No Sets' },
      }),
    ).rejects.toThrow('No completed sets or cardio details to reuse.');
  });
});
