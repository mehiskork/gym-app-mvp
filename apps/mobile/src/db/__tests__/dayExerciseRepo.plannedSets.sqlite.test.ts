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
import {
  addExerciseToDay,
  addPlannedSetToDayExercise,
  deletePlannedSet,
  listPlannedSetsForDayExercise,
  updatePlannedSetTargets,
} from '../dayExerciseRepo';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { seedCuratedExercises } from '../curatedExerciseSeed';
import { createWorkoutPlan, listDaysForWorkoutPlan } from '../workoutPlanRepo';
import { MAX_SETS_PER_EXERCISE, WorkoutLimitError } from '../workoutLimits';

type CountRow = { n: number };
type OutboxRow = {
  entity_type: string;
  entity_id: string;
  op_type: string;
  payload_json: string;
};
type PlannedSetDbRow = {
  id: string;
  set_index: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  deleted_at: string | null;
};

const strengthExerciseId = 'ex_bench_press_barbell';
const cardioExerciseId = 'ex_treadmill_run';

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function migrateSeedAndCreateDay(): string {
  resetLocalDatabase();
  runMigrations();
  seedCuratedExercises();
  const planId = createWorkoutPlan({ name: 'Planned Set Plan' });
  const dayId = listDaysForWorkoutPlan(planId)[0]?.id;
  if (!dayId) throw new Error('Expected a plan day.');
  exec('DELETE FROM outbox_op;');
  return dayId;
}

function count(sql: string, params: Array<string | number | null> = []): number {
  return query<CountRow>(sql, params)[0]?.n ?? 0;
}

function readPlannedSets(dayExerciseId: string): PlannedSetDbRow[] {
  return query<PlannedSetDbRow>(
    `
    SELECT id, set_index, target_reps_min, target_reps_max, target_weight, target_rpe, rest_seconds, deleted_at
    FROM planned_set
    WHERE program_day_exercise_id = ?
    ORDER BY set_index ASC;
  `,
    [dayExerciseId],
  );
}

function readActivePlannedSets(dayExerciseId: string): PlannedSetDbRow[] {
  return query<PlannedSetDbRow>(
    `
    SELECT id, set_index, target_reps_min, target_reps_max, target_weight, target_rpe, rest_seconds, deleted_at
    FROM planned_set
    WHERE program_day_exercise_id = ? AND deleted_at IS NULL
    ORDER BY set_index ASC;
  `,
    [dayExerciseId],
  );
}

function readOutboxRows(): OutboxRow[] {
  return query<OutboxRow>(
    `
    SELECT entity_type, entity_id, op_type, payload_json
    FROM outbox_op
    ORDER BY created_at, id;
  `,
  );
}

describe('dayExerciseRepo planned-set management with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
  });

  it('creates a default planned set for manually added strength exercises', () => {
    const dayId = migrateSeedAndCreateDay();

    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });

    expect(readActivePlannedSets(dayExerciseId)).toEqual([
      expect.objectContaining({
        set_index: 1,
        target_reps_min: 0,
        target_reps_max: 0,
        target_weight: null,
        target_rpe: null,
        rest_seconds: null,
        deleted_at: null,
      }),
    ]);
  });

  it('does not create planned sets for manually added cardio exercises', () => {
    const dayId = migrateSeedAndCreateDay();

    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: cardioExerciseId });

    expect(
      count('SELECT COUNT(*) AS n FROM planned_set WHERE program_day_exercise_id = ?;', [
        dayExerciseId,
      ]),
    ).toBe(0);
  });

  it('enqueues program_day_exercise before the default planned_set', () => {
    const dayId = migrateSeedAndCreateDay();

    addExerciseToDay({ dayId, exerciseId: strengthExerciseId });

    expect(readOutboxRows().map((row) => row.entity_type)).toEqual([
      'program_day_exercise',
      'planned_set',
    ]);
  });

  it('adds planned sets by copying previous reps and target weight', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    const firstSetId = readActivePlannedSets(dayExerciseId)[0]?.id;
    updatePlannedSetTargets(firstSetId, { reps: 8, targetWeight: 102.5 });

    addPlannedSetToDayExercise(dayExerciseId);

    expect(
      readActivePlannedSets(dayExerciseId).map((set) => ({
        set_index: set.set_index,
        target_reps_min: set.target_reps_min,
        target_reps_max: set.target_reps_max,
        target_weight: set.target_weight,
      })),
    ).toEqual([
      { set_index: 1, target_reps_min: 8, target_reps_max: 8, target_weight: 102.5 },
      { set_index: 2, target_reps_min: 8, target_reps_max: 8, target_weight: 102.5 },
    ]);
  });

  it('preserves null previous reps and target weight when adding a planned set', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    const firstSetId = readActivePlannedSets(dayExerciseId)[0]?.id;
    updatePlannedSetTargets(firstSetId, { reps: null, targetWeight: null });

    addPlannedSetToDayExercise(dayExerciseId);

    expect(readActivePlannedSets(dayExerciseId)[1]).toEqual(
      expect.objectContaining({
        set_index: 2,
        target_reps_min: null,
        target_reps_max: null,
        target_weight: null,
      }),
    );
  });

  it('defaults target weight to null when adding the first planned set to an exercise', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = 'manual-day-exercise';
    exec(
      `
      INSERT INTO program_day_exercise (id, program_day_id, exercise_id, position, notes)
      VALUES (?, ?, ?, 1, NULL);
    `,
      [dayExerciseId, dayId, strengthExerciseId],
    );

    addPlannedSetToDayExercise(dayExerciseId);

    expect(readActivePlannedSets(dayExerciseId)).toEqual([
      expect.objectContaining({
        set_index: 1,
        target_reps_min: 0,
        target_reps_max: 0,
        target_weight: null,
      }),
    ]);
  });

  it('blocks adding the 51st active planned set', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    for (let index = 1; index < MAX_SETS_PER_EXERCISE; index += 1) {
      addPlannedSetToDayExercise(dayExerciseId);
    }

    expect(() => addPlannedSetToDayExercise(dayExerciseId)).toThrow(WorkoutLimitError);
    expect(readActivePlannedSets(dayExerciseId)).toHaveLength(MAX_SETS_PER_EXERCISE);
  });

  it('updates reps min/max together and enqueues a planned_set snapshot', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    const setId = readActivePlannedSets(dayExerciseId)[0]?.id;
    exec('DELETE FROM outbox_op;');

    updatePlannedSetTargets(setId, { reps: 12 });

    expect(readActivePlannedSets(dayExerciseId)[0]).toEqual(
      expect.objectContaining({ target_reps_min: 12, target_reps_max: 12 }),
    );
    expect(readOutboxRows()).toEqual([
      expect.objectContaining({ entity_type: 'planned_set', entity_id: setId, op_type: 'upsert' }),
    ]);
  });

  it('updates target weight and enqueues a planned_set snapshot', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    const setId = readActivePlannedSets(dayExerciseId)[0]?.id;
    exec('DELETE FROM outbox_op;');

    updatePlannedSetTargets(setId, { targetWeight: 90.5 });

    expect(readActivePlannedSets(dayExerciseId)[0]).toEqual(
      expect.objectContaining({ target_weight: 90.5 }),
    );
    expect(readOutboxRows()).toEqual([
      expect.objectContaining({ entity_type: 'planned_set', entity_id: setId, op_type: 'upsert' }),
    ]);
  });

  it('tombstones deleted planned sets, compacts remaining indexes, and enqueues changed snapshots', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    addPlannedSetToDayExercise(dayExerciseId);
    addPlannedSetToDayExercise(dayExerciseId);
    const secondSetId = readActivePlannedSets(dayExerciseId)[1]?.id;
    const thirdSetId = readActivePlannedSets(dayExerciseId)[2]?.id;
    exec('DELETE FROM outbox_op;');

    expect(deletePlannedSet(secondSetId)).toBe(true);

    expect(readActivePlannedSets(dayExerciseId).map((set) => set.set_index)).toEqual([1, 2]);
    expect(
      readPlannedSets(dayExerciseId).find((set) => set.id === secondSetId)?.deleted_at,
    ).not.toBeNull();
    expect(readOutboxRows()).toEqual([
      expect.objectContaining({
        entity_type: 'planned_set',
        entity_id: secondSetId,
        op_type: 'delete',
      }),
      expect.objectContaining({
        entity_type: 'planned_set',
        entity_id: thirdSetId,
        op_type: 'upsert',
      }),
    ]);
  });

  it('blocks deleting the last planned set', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    const setId = readActivePlannedSets(dayExerciseId)[0]?.id;
    exec('DELETE FROM outbox_op;');

    expect(deletePlannedSet(setId)).toBe(false);

    expect(readActivePlannedSets(dayExerciseId)).toHaveLength(1);
    expect(readOutboxRows()).toHaveLength(0);
  });

  it('lists planned sets ordered by active set index', () => {
    const dayId = migrateSeedAndCreateDay();
    const dayExerciseId = addExerciseToDay({ dayId, exerciseId: strengthExerciseId });
    addPlannedSetToDayExercise(dayExerciseId);

    expect(listPlannedSetsForDayExercise(dayExerciseId).map((set) => set.set_index)).toEqual([
      1, 2,
    ]);
  });
});
