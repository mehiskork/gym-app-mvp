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
import { query, resetLocalDatabase } from '../db';
import { runMigrations } from '../migrate';
import { addDayToWorkoutPlan, createWorkoutPlan, listDaysForWorkoutPlan } from '../workoutPlanRepo';
import { deleteDay } from '../dayExerciseRepo';
import { MAX_SESSIONS_PER_PLAN } from '../workoutLimits';

function useDeterministicIds() {
  let next = 1;
  (uuidv4 as jest.Mock).mockImplementation(() => `00000000-0000-4000-8000-${next++}`);
}

describe('workoutPlanRepo session limits with SQLite', () => {
  beforeEach(() => {
    useDeterministicIds();
    resetLocalDatabase();
    runMigrations();
  });

  it('allows adding after deleting one at 15 and keeps active indexes contiguous', () => {
    const planId = createWorkoutPlan({ name: 'Limit Plan' });
    for (let i = 1; i < MAX_SESSIONS_PER_PLAN; i += 1) {
      addDayToWorkoutPlan(planId);
    }

    const deletedDayId = listDaysForWorkoutPlan(planId)[6]?.id;
    if (!deletedDayId) throw new Error('Expected a day to delete.');
    deleteDay(deletedDayId);

    addDayToWorkoutPlan(planId);

    expect(listDaysForWorkoutPlan(planId).map((day) => day.day_index)).toEqual(
      Array.from({ length: MAX_SESSIONS_PER_PLAN }, (_, index) => index + 1),
    );
    expect(
      query<{ n: number }>(
        `
        SELECT COUNT(*) AS n
        FROM program_day d
        JOIN program_week w ON w.id = d.program_week_id
        WHERE w.program_id = ? AND d.deleted_at IS NULL;
      `,
        [planId],
      )[0]?.n,
    ).toBe(MAX_SESSIONS_PER_PLAN);
  });
});
