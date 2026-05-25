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

jest.mock('../../utils/unfinishedWorkoutReminderNotifications', () => ({
  reconcileUnfinishedWorkoutReminder: jest.fn(() => Promise.resolve()),
  scheduleUnfinishedWorkoutReminderForSession: jest.fn(() => Promise.resolve()),
}));

import { v4 as uuidv4 } from 'uuid';
import { exec, query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { addWorkoutSet, deleteWorkoutSet, restoreWorkoutSet } from '../workoutLoggerRepo';
import { MAX_SETS_PER_EXERCISE } from '../workoutLimits';

type SetIndexRow = { set_index: number };
type SetDeletedRow = { deleted_at: string | null };

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

function seedSessionWithSets(count: number) {
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
    ) VALUES ('ws-1', NULL, NULL, 'Quick Workout', 'in_progress', datetime('now'), NULL);
  `,
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
    ) VALUES ('wse-1', 'ws-1', NULL, 'ex-1', 'Bench Press', 'strength', NULL, 1, NULL);
  `,
  );

  for (let index = 1; index <= count; index += 1) {
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
      ) VALUES (?, 'wse-1', ?, 0, 0, NULL, 90, NULL, 0);
    `,
      [`set-${index}`, index],
    );
  }
}

function listActiveSetIndexes(): number[] {
  return query<SetIndexRow>(
    `
    SELECT set_index
    FROM workout_set
    WHERE workout_session_exercise_id = 'wse-1' AND deleted_at IS NULL
    ORDER BY set_index ASC;
  `,
  ).map((row) => row.set_index);
}

function countActiveSets(): number {
  return (
    query<{ n: number }>(
      `
    SELECT COUNT(*) AS n
    FROM workout_set
    WHERE workout_session_exercise_id = 'wse-1' AND deleted_at IS NULL;
  `,
    )[0]?.n ?? 0
  );
}

function getSetDeletedAt(setId: string): string | null {
  return (
    query<SetDeletedRow>(
      `
    SELECT deleted_at
    FROM workout_set
    WHERE id = ?
    LIMIT 1;
  `,
      [setId],
    )[0]?.deleted_at ?? null
  );
}

describe('addWorkoutSet with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
    resetLocalDatabase();
    runMigrations();
  });

  it('allows deleting one at 50 and adding back with contiguous active indexes', () => {
    seedSessionWithSets(MAX_SETS_PER_EXERCISE);

    deleteWorkoutSet('set-25');
    const newSetId = addWorkoutSet('wse-1');

    expect(newSetId).toMatch(/^set_/);
    expect(listActiveSetIndexes()).toEqual(
      Array.from({ length: MAX_SETS_PER_EXERCISE }, (_, index) => index + 1),
    );
  });

  it('does not restore a deleted set when the exercise is already capped again', () => {
    seedSessionWithSets(MAX_SETS_PER_EXERCISE);

    deleteWorkoutSet('set-25');
    addWorkoutSet('wse-1');
    restoreWorkoutSet({
      id: 'set-25',
      workout_session_exercise_id: 'wse-1',
      set_index: 25,
      weight: 0,
      reps: 0,
      rpe: null,
      rest_seconds: 90,
      notes: null,
      is_completed: 0,
    });

    expect(countActiveSets()).toBe(MAX_SETS_PER_EXERCISE);
    expect(getSetDeletedAt('set-25')).not.toBeNull();
    expect(listActiveSetIndexes()).toEqual(
      Array.from({ length: MAX_SETS_PER_EXERCISE }, (_, index) => index + 1),
    );
  });

  it('restores a deleted set when the active count is below the cap', () => {
    seedSessionWithSets(MAX_SETS_PER_EXERCISE);

    deleteWorkoutSet('set-25');
    restoreWorkoutSet({
      id: 'set-25',
      workout_session_exercise_id: 'wse-1',
      set_index: 25,
      weight: 0,
      reps: 0,
      rpe: null,
      rest_seconds: 90,
      notes: null,
      is_completed: 0,
    });

    expect(countActiveSets()).toBe(MAX_SETS_PER_EXERCISE);
    expect(getSetDeletedAt('set-25')).toBeNull();
    expect(listActiveSetIndexes()).toContain(25);
  });
});
