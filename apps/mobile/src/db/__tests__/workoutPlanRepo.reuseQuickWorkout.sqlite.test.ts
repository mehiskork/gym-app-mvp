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
  saveCompletedQuickWorkoutAsPlan,
} from '../workoutPlanRepo';
import { MAX_SESSIONS_PER_PLAN, WorkoutLimitError } from '../workoutLimits';

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

const benchId = 'ex_bench_press_barbell';
const rowId = 'ex_bent_over_row_barbell';

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

function readOutboxRows(): OutboxRow[] {
  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, payload_json
    FROM outbox_op
    ORDER BY created_at, id;
  `,
  );
}

describe('saveCompletedQuickWorkoutAsPlan', () => {
  beforeEach(() => {
    useDeterministicIds();
    migrateAndSeed();
  });

  it('converts a completed Quick Workout into a new plan with copied strength exercises and planned sets', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('DELETE FROM outbox_op;');

    const result = await saveCompletedQuickWorkoutAsPlan({
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
        rest_seconds: null,
      },
      {
        set_index: 2,
        target_reps_min: null,
        target_reps_max: null,
        target_weight: null,
        target_rpe: null,
        rest_seconds: null,
      },
      {
        set_index: 1,
        target_reps_min: 8,
        target_reps_max: 8,
        target_weight: 80,
        target_rpe: null,
        rest_seconds: null,
      },
      {
        set_index: 1,
        target_reps_min: 10,
        target_reps_max: 10,
        target_weight: 90,
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

    const result = await saveCompletedQuickWorkoutAsPlan({
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
  });

  it('enqueues planner outbox snapshots for inserted entities', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('DELETE FROM outbox_op;');

    await saveCompletedQuickWorkoutAsPlan({
      sessionId,
      target: { kind: 'newPlan', name: 'Synced Plan' },
    });

    const entityTypes = readOutboxRows().map((row) => row.entity_type);
    expect(entityTypes.filter((type) => type === 'program')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_week')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_day')).toHaveLength(1);
    expect(entityTypes.filter((type) => type === 'program_day_exercise')).toHaveLength(3);
    expect(entityTypes.filter((type) => type === 'planned_set')).toHaveLength(4);
    expect(
      readOutboxRows()
        .filter((row) => row.entity_type === 'planned_set')
        .every((row) => JSON.parse(row.payload_json).rest_seconds === null),
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
      saveCompletedQuickWorkoutAsPlan({
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

  it('defensively rejects ineligible source sessions', async () => {
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

    await expect(
      saveCompletedQuickWorkoutAsPlan({
        sessionId: quickSessionId,
        target: { kind: 'newPlan', name: 'Rejected' },
      }),
    ).rejects.toThrow('Only completed Quick Workouts can be reused.');

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
      saveCompletedQuickWorkoutAsPlan({
        sessionId: quickSessionId,
        target: { kind: 'newPlan', name: 'Rejected' },
      }),
    ).rejects.toThrow('Only completed Quick Workouts can be reused.');

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
      saveCompletedQuickWorkoutAsPlan({
        sessionId: quickSessionId,
        target: { kind: 'newPlan', name: 'Rejected' },
      }),
    ).rejects.toThrow('Only completed Quick Workouts can be reused.');
  });

  it('rejects completed Quick Workouts with no completed strength sets', async () => {
    const sessionId = seedCompletedQuickWorkout();
    exec('UPDATE workout_set SET is_completed = 0;');

    await expect(
      saveCompletedQuickWorkoutAsPlan({
        sessionId,
        target: { kind: 'newPlan', name: 'No Sets' },
      }),
    ).rejects.toThrow('No completed strength sets to reuse.');
  });
});
